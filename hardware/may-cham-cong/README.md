# Máy chấm công vân tay — Funti Kidbooks

ESP32 + cảm biến vân tay, đặt ở công ty, chấm công thẳng lên funtikidbooks.com
(Quản trị → Chấm công). Vân tay lưu **trong cảm biến**; web chỉ biết "vân tay số 3
là của Lucia".

## 1. Linh kiện

| Linh kiện | Ghi chú |
|---|---|
| ESP32 DevKit V1 (38 hoặc 30 chân) | loại phổ biến nhất |
| Cảm biến vân tay **R503** (nên dùng) hoặc AS608 | R503: cảm ứng điện dung, có vòng đèn màu, tay hơi ướt vẫn nhận |
| Màn OLED 0.96" I2C SSD1306 (4 chân) | địa chỉ 0x3C |
| Còi **chủ động** 3.3–5V (active buzzer) | loại tự kêu khi cấp điện |
| Dây cắm, cục sạc USB 5V + cáp micro-USB/USB-C | cấp điện cho ESP32 |
| Hộp nhựa | khoét lỗ cho cảm biến và màn hình |

## 2. Nối dây

**Cảm biến vân tay → ESP32**

| Cảm biến | ESP32 |
|---|---|
| V+ / VCC | 3V3 |
| GND | GND |
| TX | GPIO **16** |
| RX | GPIO **17** |
| (R503) 3.3VT / VT | 3V3 |
| (R503) WAKEUP / IRQ | để trống |

> Màu dây R503 hay gặp: đỏ = V+, đen = GND, vàng = TX, xanh lá = RX, trắng = 3.3VT,
> xanh dương = WAKEUP — nhưng mỗi lô có thể khác, **xem tờ thông số đi kèm cho chắc**.
> Cảm biến dùng điện **3.3V**, đừng cắm 5V.

**Màn OLED → ESP32:** VCC → 3V3 · GND → GND · SDA → GPIO **21** · SCL → GPIO **22**

**Còi → ESP32:** chân + (dài) → GPIO **25** · chân − → GND

## 3. Nạp chương trình

1. Cài **Arduino IDE** (arduino.cc).
2. Boards Manager → cài **esp32** (by Espressif Systems).
3. Library Manager → cài: **Adafruit Fingerprint Sensor Library**, **Adafruit SSD1306**
   (đồng ý cài kèm Adafruit GFX, BusIO), **ArduinoJson** (bản 7.x).
4. Mở `may-cham-cong.ino`, điền 4 dòng đầu:
   - `WIFI_NAME`, `WIFI_PASS` — Wi-Fi **2.4GHz** của công ty (ESP32 không bắt 5GHz).
   - `DEVICE_TOKEN` — vào **Quản trị → Chấm công → Máy chấm công vân tay → Mở → + Thêm máy**,
     bấm **📋 Chép** rồi dán đè cả dòng `DEVICE_TOKEN`. Mã chỉ hiện một lần; mất thì bấm
     **Mã kết nối mới**.
5. Tools → Board: **ESP32 Dev Module** · Port: cổng COM của mạch → **Upload**.
   (Nếu báo "Connecting…" mãi: giữ nút **BOOT** trên mạch đến khi bắt đầu nạp.)
6. Màn hình hiện giờ và "Wi-Fi ok"; trên web thấy **● đang bật**.

## 4. Đăng ký vân tay

Quản trị → Chấm công → Máy chấm công vân tay → bấm **+ Vân tay** cạnh tên người đó.
Trong ~10 giây máy nhận lệnh, rồi hướng dẫn: đặt tay → nhấc ra → đặt lại. Web hiện
từng bước. Nên đăng ký **2 ngón** mỗi người.

## 5. Máy hoạt động thế nào

- Chạm lần đầu trong ngày = **giờ vào** (thay giờ tự chấm khi mở web, nếu có).
  Chạm sau đó = **giờ về** (lấy lần cuối). Chạm lại trong 2 phút = bỏ qua.
- Màn hình: "Chao Lucia / Vao 08:57 / Dung gio" hoặc "Tre 12 phut"; còi 1 tiếng = ổn,
  2 tiếng = lưu ý, kêu dài = lỗi / không nhận ra.
- Mất Wi-Fi: vẫn chấm, máy lưu lại kèm giờ (tối đa 150 lần) và gửi bù khi có mạng.
- Xoá vân tay trên web → máy tự xoá trong cảm biến.
- Muốn chỉ tính giờ bằng vân tay: trên web chuyển **Tự chấm công khi mở web → Tắt**.
