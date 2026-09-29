// Máy chấm công vân tay — Funti Kidbooks Studio
// Mạch: ESP32 DevKit + cảm biến vân tay R503 (hoặc AS608) + màn OLED 0.96"
// SSD1306 + còi chủ động. Nối dây và cách nạp: xem README.md cùng thư mục.
//
// Máy làm 3 việc:
//  1. Có người đặt tay → tìm vân tay trong cảm biến → gửi số vân tay lên
//     funtikidbooks.com/api/clock/scan → hiện "Chao Lucia / Vao 08:57 / Dung gio".
//  2. Vài giây hỏi web một lần có lệnh gì không (đăng ký / xoá vân tay, bấm
//     từ Quản trị → Chấm công) và làm theo.
//  3. Mất Wi-Fi thì tự lưu các lần chấm kèm giờ, có mạng lại thì gửi bù.
//
// Thư viện cần cài (Arduino IDE → Library Manager): "Adafruit Fingerprint
// Sensor Library", "Adafruit SSD1306" (tự kèm Adafruit GFX), "ArduinoJson" (bản 7).

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_Fingerprint.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Preferences.h>
#include <time.h>

// ======================= ĐIỀN 4 DÒNG NÀY =======================
const char* WIFI_NAME = "TEN_WIFI_CONG_TY";       // Wi-Fi 2.4GHz (ESP32 không bắt 5GHz)
const char* WIFI_PASS = "MAT_KHAU_WIFI";
const char* SERVER_URL = "https://funtikidbooks.com";
const char* DEVICE_TOKEN = "DAN_MA_KET_NOI_O_DAY";  // Quản trị → Chấm công → Máy chấm công → + Thêm máy
// ===============================================================

const char* FIRMWARE = "1.0";

// Chân nối — xem bảng trong README.md
const int FINGER_RX = 16;   // ESP32 nhận  ← chân TX của cảm biến
const int FINGER_TX = 17;   // ESP32 gửi   → chân RX của cảm biến
const int BUZZER_PIN = 25;  // chân + của còi (chân - xuống GND)

HardwareSerial fingerSerial(2);
Adafruit_Fingerprint finger(&fingerSerial);
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
Preferences store;

bool sensorOk = false;
bool oledOk = false;
uint32_t lastPoll = 0, lastFlush = 0, lastIdleDraw = 0, lastWifiTry = 0, busyUntil = 0, fastPollUntil = 0;

// ---------------------------------------------------------------- màn hình, còi, đèn

void show(const String& title, const String& big, const String& note) {
  if (!oledOk) return;
  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);
  oled.setTextSize(1);
  oled.setCursor(0, 0);
  oled.println(title);
  oled.setTextSize(2);
  oled.setCursor(0, 20);
  oled.println(big);
  oled.setTextSize(1);
  oled.setCursor(0, 50);
  oled.println(note);
  oled.display();
}

void beep(int ms) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(ms);
  digitalWrite(BUZZER_PIN, LOW);
}

// Vòng đèn quanh cảm biến R503 (AS608 không có — lệnh bị bỏ qua, không sao).
void ring(uint8_t mode, uint8_t color) {
  if (sensorOk) finger.LEDcontrol(mode, 60, color, mode == FINGERPRINT_LED_FLASHING ? 3 : 0);
}

void feedback(const String& tone) {
  if (tone == "ok") {
    ring(FINGERPRINT_LED_FLASHING, FINGERPRINT_LED_BLUE);
    beep(80);
  } else if (tone == "warn") {
    ring(FINGERPRINT_LED_FLASHING, FINGERPRINT_LED_PURPLE);
    beep(70);
    delay(90);
    beep(70);
  } else {
    ring(FINGERPRINT_LED_FLASHING, FINGERPRINT_LED_RED);
    beep(450);
  }
}

String clockText() {
  struct tm tm;
  if (!getLocalTime(&tm, 5)) return "--:--";
  char b[6];
  strftime(b, sizeof b, "%H:%M", &tm);
  return String(b);
}

// Giờ Việt Nam lấy từ internet (NTP); 0 = chưa có giờ.
uint32_t nowEpoch() {
  time_t t = time(nullptr);
  return t > 1700000000 ? (uint32_t)t : 0;
}

bool workHours() {
  struct tm tm;
  if (!getLocalTime(&tm, 5)) return true;
  return tm.tm_hour >= 7 && tm.tm_hour < 20;
}

// ---------------------------------------------------------------- gọi web

// Trả về mã HTTP (200 = được), -1 = không có mạng.
int api(const char* method, const String& path, const String& body, JsonDocument& out) {
  if (WiFi.status() != WL_CONNECTED) return -1;
  WiFiClientSecure client;
  // Mã hoá HTTPS nhưng không kiểm tra chứng chỉ của web — đủ cho máy trong
  // mạng công ty. Muốn chặt hơn: client.setCACert(<chứng chỉ ISRG Root X1>).
  client.setInsecure();
  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(client, String(SERVER_URL) + path)) return -1;
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.addHeader("Content-Type", "application/json");
  int code = strcmp(method, "GET") == 0 ? http.GET() : http.POST(body);
  if (code > 0) {
    String resp = http.getString();
    if (resp.length()) deserializeJson(out, resp);
  }
  http.end();
  return code;
}

// ---------------------------------------------------------------- hàng chờ khi mất mạng
// Lưu trong bộ nhớ của ESP32 (không mất khi rút điện): "so,gio;so,gio;…"

int queueCount() {
  String q = store.getString("q", "");
  int n = 0;
  for (size_t i = 0; i < q.length(); i++)
    if (q[i] == ';') n++;
  return n;
}

void enqueue(uint16_t slot, uint32_t at) {
  String q = store.getString("q", "");
  if (queueCount() >= 150) q = q.substring(q.indexOf(';') + 1);  // đầy: bỏ lần cũ nhất
  q += String(slot) + "," + String(at) + ";";
  store.putString("q", q);
}

void flushQueue() {
  String q = store.getString("q", "");
  int sep = q.indexOf(';');
  if (sep < 0) return;
  String first = q.substring(0, sep);
  int comma = first.indexOf(',');
  JsonDocument req, res;
  req["slot"] = first.substring(0, comma).toInt();
  req["at"] = (uint32_t)first.substring(comma + 1).toInt();
  String body;
  serializeJson(req, body);
  int code = api("POST", "/api/clock/scan", body, res);
  // 200: đã nhận (kể cả vân tay chưa đăng ký); 400: dữ liệu hỏng — bỏ luôn.
  if (code == 200 || code == 400) store.putString("q", q.substring(sep + 1));
}

// ---------------------------------------------------------------- chấm công

bool waitFinger(uint32_t ms) {
  uint32_t t = millis();
  while (millis() - t < ms) {
    if (finger.getImage() == FINGERPRINT_OK) return true;
    delay(60);
  }
  return false;
}

bool waitNoFinger(uint32_t ms) {
  uint32_t t = millis();
  while (millis() - t < ms) {
    if (finger.getImage() == FINGERPRINT_NOFINGER) return true;
    delay(60);
  }
  return false;
}

void scanOnce() {
  if (finger.getImage() != FINGERPRINT_OK) return;  // chưa có ai đặt tay
  if (finger.image2Tz() != FINGERPRINT_OK) {
    show("", "Dat lai", "Dat ngon tay ngay ngan");
    feedback("error");
    waitNoFinger(3000);
    return;
  }
  uint8_t p = finger.fingerSearch();
  if (p == FINGERPRINT_NOTFOUND) {
    show("Khong nhan ra", "Thu lai", "hoac bao quan ly");
    feedback("error");
    waitNoFinger(3000);
    busyUntil = millis() + 2000;
    return;
  }
  if (p != FINGERPRINT_OK) {
    show("", "Loi doc", "Thu lai");
    feedback("error");
    waitNoFinger(3000);
    return;
  }

  uint16_t slot = finger.fingerID;
  uint32_t at = nowEpoch();
  show("", "...", "Dang gui");
  JsonDocument req, res;
  req["slot"] = slot;
  if (at) req["at"] = at;
  String body;
  serializeJson(req, body);
  int code = api("POST", "/api/clock/scan", body, res);

  if (code == 200) {
    show(res["title"] | "", res["big"] | "", res["note"] | "");
    feedback(res["tone"] | "ok");
  } else if (code == 401) {
    show("Sai ma ket noi", "Loi", "Kiem tra DEVICE_TOKEN");
    feedback("error");
  } else if (at) {
    enqueue(slot, at);  // mất mạng / web lỗi: giữ lại, gửi bù sau
    show("Da ghi nhan", clockText(), "Se gui khi co mang");
    feedback("ok");
  } else {
    show("Chua co gio", "Loi mang", "Kiem tra Wi-Fi");
    feedback("error");
  }
  busyUntil = millis() + 3000;
  waitNoFinger(4000);
}

// ---------------------------------------------------------------- lệnh từ web

// Báo tiến độ cho web; trả về true nếu người ở web đã bấm Huỷ.
bool report(const String& id, const char* status, const String& step) {
  JsonDocument req, res;
  req["id"] = id;
  req["status"] = status;
  req["step"] = step;
  String body;
  serializeJson(req, body);
  int code = api("POST", "/api/clock/commands", body, res);
  return code == 200 && (res["cancelled"] | false);
}

void failEnroll(const String& id, const char* why, const String& name, const String& big, const String& note) {
  report(id, "failed", why);
  show(name, big, note);
  feedback("error");
  waitNoFinger(3000);
  busyUntil = millis() + 2500;
}

bool cancelledAt(const String& id, const char* step, const String& name) {
  if (!report(id, "running", step)) return false;
  show(name, "Da huy", "");
  feedback("warn");
  busyUntil = millis() + 2000;
  return true;
}

void enroll(const String& id, int slot, const String& name) {
  ring(FINGERPRINT_LED_BREATHING, FINGERPRINT_LED_PURPLE);
  if (cancelledAt(id, "place1", name)) return;
  show("Dang ky: " + name, "Dat tay", "Dat ngon tay len may");
  if (!waitFinger(25000)) return failEnroll(id, "timeout", name, "Het gio", "Bam dang ky lai");
  if (finger.image2Tz(1) != FINGERPRINT_OK) return failEnroll(id, "image", name, "Loi doc", "Bam dang ky lai");
  if (finger.fingerSearch() == FINGERPRINT_OK)
    return failEnroll(id, ("duplicate:" + String(finger.fingerID)).c_str(), name, "Da co roi", "Van tay nay da dang ky");

  if (cancelledAt(id, "lift", name)) return;
  show("Dang ky: " + name, "Nhac tay", "");
  beep(60);
  waitNoFinger(10000);

  if (cancelledAt(id, "place2", name)) return;
  show("Dang ky: " + name, "Dat lai", "Dung ngon vua roi");
  if (!waitFinger(25000)) return failEnroll(id, "timeout", name, "Het gio", "Bam dang ky lai");
  if (finger.image2Tz(2) != FINGERPRINT_OK) return failEnroll(id, "image", name, "Loi doc", "Bam dang ky lai");
  if (finger.createModel() != FINGERPRINT_OK) return failEnroll(id, "mismatch", name, "Khong khop", "Hai lan khac nhau");

  if (cancelledAt(id, "saving", name)) return;
  if (finger.storeModel(slot) != FINGERPRINT_OK) return failEnroll(id, "store", name, "Loi luu", "Bam dang ky lai");
  if (report(id, "done", "")) {
    finger.deleteModel(slot);  // bị huỷ đúng lúc vừa lưu: xoá lại cho sạch
    show(name, "Da huy", "");
    feedback("warn");
  } else {
    show(name, "Da luu!", "Van tay so " + String(slot));
    feedback("ok");
  }
  waitNoFinger(4000);
  busyUntil = millis() + 2500;
}

void pollCommand() {
  JsonDocument res;
  String path = String("/api/clock/commands?cap=") + finger.capacity + "&fw=" + FIRMWARE;
  if (api("GET", path, "", res) != 200 || res["command"].isNull()) return;
  String id = res["command"]["id"] | "";
  String kind = res["command"]["kind"] | "";
  int slot = res["command"]["slot"] | 0;
  String name = res["command"]["name"] | "";
  fastPollUntil = millis() + 120000;  // có việc: 2 phút tới hỏi dày hơn
  if (kind == "enroll") enroll(id, slot, name);
  else if (kind == "delete") {
    finger.deleteModel(slot);
    report(id, "done", "");
  }
  ring(FINGERPRINT_LED_BREATHING, FINGERPRINT_LED_BLUE);
}

// ---------------------------------------------------------------- chạy

void drawIdle() {
  String net = WiFi.status() == WL_CONNECTED ? "Wi-Fi ok" : "Mat Wi-Fi";
  int q = queueCount();
  if (q) net += " | cho gui " + String(q);
  show(sensorOk ? "Dat tay de cham cong" : "LOI CAM BIEN", clockText(), net);
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  oledOk = oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  show("Funti Kidbooks", "Khoi dong", String("ban ") + FIRMWARE);
  store.begin("clock", false);

  fingerSerial.begin(57600, SERIAL_8N1, FINGER_RX, FINGER_TX);
  finger.begin(57600);
  sensorOk = finger.verifyPassword();
  if (sensorOk) {
    finger.getParameters();
    ring(FINGERPRINT_LED_BREATHING, FINGERPRINT_LED_BLUE);
  } else {
    show("LOI CAM BIEN", "Kiem tra", "day TX/RX, nguon 3V3");
    Serial.println("Khong thay cam bien van tay — kiem tra day noi");
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_NAME, WIFI_PASS);
  configTzTime("ICT-7", "pool.ntp.org", "time.google.com");
  beep(60);
}

void loop() {
  uint32_t ms = millis();
  if (WiFi.status() != WL_CONNECTED && ms - lastWifiTry > 15000) {
    lastWifiTry = ms;
    WiFi.disconnect();
    WiFi.begin(WIFI_NAME, WIFI_PASS);
  }
  if (sensorOk) scanOnce();
  if (WiFi.status() == WL_CONNECTED) {
    uint32_t every = ms < fastPollUntil ? 3000 : (workHours() ? 10000 : 60000);
    if (ms - lastPoll > every) {
      lastPoll = ms;
      pollCommand();
    }
    if (ms - lastFlush > 4000 && queueCount()) {
      lastFlush = ms;
      flushQueue();
    }
  }
  if (ms > busyUntil && ms - lastIdleDraw > 1000) {
    lastIdleDraw = ms;
    drawIdle();
  }
  delay(40);
}
