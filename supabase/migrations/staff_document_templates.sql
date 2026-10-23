-- Hợp đồng mẫu (23/10/2026): reusable contract templates in Quản trị →
-- Hợp đồng. Creating a document for someone can start from a template;
-- {{ho_ten}} {{chuc_danh}} {{dien_thoai}} {{email}} {{ngay_bat_dau}} and the CCCD fields
-- {{ngay_het_thu_viec}} {{hom_nay}} {{nam}} are filled in from their
-- profile. Same access as staff_documents: director / Project Manager.
create table if not exists public.staff_document_templates (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('labor_contract', 'probation_contract', 'nda', 'other')),
  name text not null,
  title text not null,
  content text not null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_document_templates enable row level security;

drop policy if exists "HR manages document templates" on public.staff_document_templates;
create policy "HR manages document templates" on public.staff_document_templates
  for all using (public.can_manage_hr()) with check (public.can_manage_hr());

-- Starting templates, taken from the contracts already in use (personal
-- details and salary left blank).
insert into public.staff_document_templates (type, name, title, content)
select v.type, v.name, v.title, v.content
from (values
  ('probation_contract', 'Hợp đồng thử việc (mẫu chuẩn)', 'Hợp đồng thử việc', $tpl$CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập – Tự do – Hạnh phúc
---------------------------

HỢP ĐỒNG THỬ VIỆC
Số: [Số HĐ, VD: 01]/{{nam}}/HĐTV-FTKB

Căn cứ Bộ luật Lao động số 45/2019/QH14 ngày 20/11/2019 (Điều 24, 25, 26, 27);
Căn cứ nhu cầu và khả năng thực tế của hai bên,

Hôm nay, {{hom_nay}}, tại Công ty TNHH Funti Kidbooks, chúng tôi gồm:

BÊN A (NGƯỜI SỬ DỤNG LAO ĐỘNG):
Công ty TNHH Funti Kidbooks
Mã số thuế: 0319688648
Địa chỉ: 40A-40B Út Tịch, Phường Tân Sơn Nhất, Tân Bình, TP.HCM
Điện thoại: 0978 346 851 · Email: funtikidbooks.studio@gmail.com
Đại diện: Phúc Trần – Chức vụ: Giám đốc

BÊN B (NGƯỜI THỬ VIỆC):
Họ và tên: {{ho_ten}}
Ngày sinh: {{ngay_sinh}} · Giới tính: {{gioi_tinh}}
Số CCCD: {{so_cccd}} – Ngày cấp: {{ngay_cap}} – Nơi cấp: {{noi_cap}}
Nơi cư trú: {{noi_cu_tru}}
Điện thoại: {{dien_thoai}} · Email: {{email}}

Hai bên thỏa thuận ký kết hợp đồng thử việc và cam kết thực hiện đúng những điều khoản sau đây:

Điều 1. Công việc và địa điểm làm việc
1. Chức danh công việc: {{chuc_danh}}
2. Mô tả công việc: Hoạ sĩ minh hoạ
3. Địa điểm làm việc: Văn phòng công ty tại địa chỉ nêu trên

Điều 2. Thời gian thử việc
Thời gian thử việc: 60 ngày, kể từ ngày {{ngay_bat_dau}} đến ngày {{ngay_het_thu_viec}}.
(Không vượt quá mức trần theo Điều 25 BLLĐ 2019: tối đa 180 ngày cho quản lý, 60 ngày cho công việc cần trình độ cao đẳng trở lên, 30 ngày trình độ trung cấp, 6 ngày cho công việc khác.)

Điều 3. Lương thử việc
1. Mức lương thử việc: [Mức lương] đồng/tháng — tương đương 85% mức lương chính thức của vị trí (không thấp hơn 85% theo quy định).
2. Mức lương chính thức dự kiến sau khi đạt yêu cầu: Trao đổi lại sau thời gian thử việc.
3. Hình thức trả lương: Chuyển khoản ngân hàng. Thời hạn trả lương: trước ngày 5 hằng tháng.

Điều 4. Thời giờ làm việc, thời giờ nghỉ ngơi
Thời giờ làm việc: 8 tiếng/ngày, 5 ngày/tuần, theo lịch làm việc Công ty quy định. Nghỉ hằng tuần, nghỉ lễ theo đúng quy định của Bộ luật Lao động hiện hành.

Điều 5. Bảo mật thông tin và quyền sở hữu trí tuệ
1. Toàn bộ sản phẩm sáng tạo (bản vẽ, minh họa, thiết kế nhân vật, bố cục sách...) Bên B thực hiện trong thời gian thử việc tại Công ty thuộc quyền sở hữu của Công ty, trừ trường hợp có thỏa thuận khác bằng văn bản.
2. Bên B có trách nhiệm bảo mật thông tin kinh doanh, thông tin khách hàng, tác phẩm chưa công bố theo Thỏa thuận bảo mật (NDA) ký kèm hợp đồng này.

Điều 6. Đánh giá kết quả thử việc
1. Trong vòng 03 ngày trước khi kết thúc thời gian thử việc, Bên A tiến hành đánh giá kết quả công việc của Bên B.
2. Trường hợp đạt yêu cầu: hai bên tiến hành ký kết Hợp đồng lao động chính thức.
3. Trường hợp không đạt yêu cầu hoặc một trong hai bên không muốn tiếp tục: mỗi bên có quyền hủy bỏ thỏa thuận thử việc mà không cần báo trước và không phải bồi thường, theo đúng quy định tại Điều 27 Bộ luật Lao động 2019.

Điều 7. Quyền và nghĩa vụ của các bên
1. Bên A (Công ty):
   - Bố trí công việc, hướng dẫn, đánh giá đúng thực tế năng lực của Bên B.
   - Trả lương đầy đủ, đúng hạn theo thỏa thuận tại Điều 3.
   - Tôn trọng danh dự, nhân phẩm của Bên B.
2. Bên B (Người thử việc):
   - Thực hiện công việc theo đúng thỏa thuận, tuân thủ nội quy, quy định của Công ty.
   - Bảo vệ tài sản, bí mật kinh doanh, bí mật công nghệ của Công ty.
   - Chủ động trao đổi, học hỏi để hoàn thành tốt công việc trong thời gian thử việc.

Điều 8. Điều khoản thi hành
1. Hợp đồng này có hiệu lực kể từ ngày ký và tự động hết hiệu lực khi kết thúc thời gian thử việc nêu tại Điều 2 (trừ khi hai bên ký Hợp đồng lao động chính thức thay thế).
2. Việc ký xác nhận điện tử của Bên B ở cuối văn bản này (chữ ký vẽ tay + họ tên + thời gian ký) có giá trị như chữ ký tay trên bản hợp đồng giấy, theo quy định của Luật Giao dịch điện tử.
3. Mọi sửa đổi, bổ sung phải được hai bên thỏa thuận bằng văn bản.

Hai bên đã đọc, hiểu rõ và đồng ý ký kết hợp đồng thử việc này.$tpl$),
  ('labor_contract', 'Hợp đồng lao động (mẫu chuẩn)', 'Hợp đồng lao động', $tpl$CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập – Tự do – Hạnh phúc
---------------------------

HỢP ĐỒNG LAO ĐỘNG
Số: [Số HĐ, VD: 01]/{{nam}}/HĐLĐ-FTKB

Căn cứ Bộ luật Lao động số 45/2019/QH14 ngày 20/11/2019;
Căn cứ nhu cầu và khả năng thực tế của hai bên,

Hôm nay, {{hom_nay}}, tại Công ty TNHH Funti Kidbooks, chúng tôi gồm:

BÊN A (NGƯỜI SỬ DỤNG LAO ĐỘNG):
Công ty TNHH Funti Kidbooks
Mã số thuế: 0319688648
Địa chỉ: 40A-40B Út Tịch, Phường Tân Sơn Nhất, Tân Bình, TP.HCM
Điện thoại: 0978 346 851 · Email: funtikidbooks.studio@gmail.com
Đại diện: Phúc Trần – Chức vụ: Giám đốc

BÊN B (NGƯỜI LAO ĐỘNG):
Họ và tên: {{ho_ten}}
Ngày sinh: {{ngay_sinh}} · Giới tính: {{gioi_tinh}}
Số CCCD: {{so_cccd}} – Ngày cấp: {{ngay_cap}} – Nơi cấp: {{noi_cap}}
Nơi cư trú: {{noi_cu_tru}}
Điện thoại: {{dien_thoai}} · Email: {{email}}

Hai bên thỏa thuận ký kết hợp đồng lao động và cam kết thực hiện đúng những điều khoản sau đây:

Điều 1. Công việc và địa điểm làm việc
1. Chức danh công việc: {{chuc_danh}}
2. Mô tả công việc: Hoạ sĩ minh hoạ
3. Địa điểm làm việc: [Văn phòng công ty tại địa chỉ nêu trên / làm việc từ xa theo thỏa thuận]

Điều 2. Thời hạn hợp đồng
1. Loại hợp đồng: [Không xác định thời hạn / Xác định thời hạn từ ngày ... đến ngày ...]
2. Thời gian thử việc (nếu có): [Số ngày] ngày, từ ngày [...] đến ngày [...], hưởng [tỷ lệ]% mức lương chính thức (tối thiểu 85% theo quy định).

Điều 3. Thời giờ làm việc, thời giờ nghỉ ngơi
1. Thời giờ làm việc: [Số giờ/ngày, số ngày/tuần], cụ thể theo lịch làm việc Công ty quy định.
2. Nghỉ hằng tuần, nghỉ lễ, tết, nghỉ phép năm: thực hiện theo đúng quy định của Bộ luật Lao động hiện hành.

Điều 4. Lương và các khoản phụ cấp
1. Mức lương chính thức: [Mức lương] đồng/tháng (không thấp hơn mức lương tối thiểu vùng I hiện hành: 5.310.000 đồng/tháng).
2. Hình thức trả lương: Chuyển khoản ngân hàng.
3. Thời hạn trả lương: Trước ngày [Ngày] hằng tháng.
4. Phụ cấp, thưởng (nếu có): [Ghi cụ thể nếu có]
5. Chế độ nâng lương: theo thỏa thuận và đánh giá năng lực định kỳ hằng năm giữa hai bên.

Điều 5. Bảo hiểm xã hội, bảo hiểm y tế, bảo hiểm thất nghiệp
Hai bên thực hiện đóng bảo hiểm xã hội, bảo hiểm y tế, bảo hiểm thất nghiệp theo đúng quy định pháp luật hiện hành, áp dụng đối với hợp đồng lao động từ đủ 01 tháng trở lên.

Điều 6. Trang bị làm việc, an toàn vệ sinh lao động
Công ty đảm bảo điều kiện làm việc, trang thiết bị cần thiết (máy tính, phần mềm, tài khoản công cụ...) phù hợp với tính chất công việc sáng tạo nội dung/thiết kế.

Điều 7. Đào tạo, bồi dưỡng
Công ty tạo điều kiện để Người lao động tham gia các khóa đào tạo, nâng cao kỹ năng nghề nghiệp phù hợp với công việc khi có nhu cầu và điều kiện phù hợp.

Điều 8. Bảo mật thông tin và quyền sở hữu trí tuệ
1. Toàn bộ sản phẩm sáng tạo (bản vẽ, minh họa, thiết kế nhân vật, bố cục sách...) do Người lao động thực hiện trong quá trình làm việc tại Công ty thuộc quyền sở hữu của Công ty, trừ trường hợp có thỏa thuận khác bằng văn bản.
2. Người lao động có trách nhiệm bảo mật thông tin kinh doanh, thông tin khách hàng và các tác phẩm chưa công bố theo Thỏa thuận bảo mật (NDA) ký kèm hợp đồng này.

Điều 9. Quyền và nghĩa vụ của các bên
1. Bên A (Công ty):
   - Bảo đảm việc làm, trả lương đầy đủ, đúng hạn theo thỏa thuận.
   - Thực hiện đầy đủ nghĩa vụ bảo hiểm, các chế độ theo quy định pháp luật lao động.
   - Tôn trọng danh dự, nhân phẩm của Người lao động.
2. Bên B (Người lao động):
   - Thực hiện công việc theo đúng thỏa thuận, tuân thủ nội quy, quy định của Công ty.
   - Bảo vệ tài sản, bí mật kinh doanh, bí mật công nghệ của Công ty.
   - Chấp hành sự phân công, điều động hợp lý của người quản lý trực tiếp.

Điều 10. Chấm dứt hợp đồng
Việc đơn phương chấm dứt hợp đồng của mỗi bên thực hiện theo đúng quy định tại Bộ luật Lao động hiện hành, bao gồm cả thời hạn báo trước tương ứng với loại hợp đồng đã giao kết.

Điều 11. Điều khoản thi hành
1. Hợp đồng này có hiệu lực kể từ ngày ký.
2. Việc ký xác nhận điện tử của Bên B ở cuối văn bản này (chữ ký vẽ tay + họ tên + thời gian ký) có giá trị như chữ ký tay trên bản hợp đồng giấy, theo quy định của Luật Giao dịch điện tử.
3. Mọi sửa đổi, bổ sung phải được hai bên thỏa thuận bằng văn bản.

Hai bên đã đọc, hiểu rõ và đồng ý ký kết hợp đồng lao động này.$tpl$),
  ('nda', 'Thoả thuận bảo mật NDA (mẫu chuẩn)', 'Thoả thuận bảo mật (NDA)', $tpl$CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập – Tự do – Hạnh phúc
---------------------------

THỎA THUẬN BẢO MẬT THÔNG TIN
(Non-Disclosure Agreement – NDA)
Số: [Số, VD: 01]/{{nam}}/NDA-FTKB

Căn cứ Bộ luật Dân sự 2015, Bộ luật Lao động 2019 và Luật Sở hữu trí tuệ hiện hành;
Căn cứ Hợp đồng lao động số [Số HĐLĐ liên quan, nếu có] ký giữa hai bên,

Hôm nay, {{hom_nay}}, chúng tôi gồm:

BÊN CÔNG BỐ THÔNG TIN (BÊN A):
Công ty TNHH Funti Kidbooks
Mã số thuế: 0319688648
Địa chỉ: 40A-40B Út Tịch, Phường Tân Sơn Nhất, Tân Bình, TP.HCM
Đại diện: Phúc Trần – Chức vụ: Giám đốc

BÊN NHẬN THÔNG TIN (BÊN B):
Họ và tên: {{ho_ten}}
Chức danh: {{chuc_danh}}
Số CCCD: {{so_cccd}}

Hai bên thống nhất thỏa thuận các nội dung sau:

Điều 1. Thông tin bảo mật
"Thông tin bảo mật" theo thỏa thuận này bao gồm nhưng không giới hạn ở:
1. Bản thảo, bản vẽ, minh họa, thiết kế nhân vật, bố cục (layout) sách chưa xuất bản hoặc chưa công bố ra công chúng;
2. Thông tin khách hàng, đối tác, nhà xuất bản, hợp đồng, báo giá, dữ liệu tài chính của Công ty;
3. Quy trình làm việc nội bộ, công cụ, tài khoản, phần mềm, tài liệu đào tạo nội bộ;
4. Bất kỳ thông tin nào khác được Công ty đánh dấu hoặc thông báo rõ là bảo mật.

Điều 2. Nghĩa vụ bảo mật của Bên B
1. Không tiết lộ, sao chép, sử dụng Thông tin bảo mật cho bất kỳ mục đích nào ngoài phạm vi công việc được giao tại Công ty.
2. Không chia sẻ Thông tin bảo mật cho bên thứ ba — kể cả sau khi nghỉ việc — khi chưa có sự đồng ý bằng văn bản của Công ty.
3. Không đăng tải hình ảnh, bản vẽ, nội dung sách chưa được Công ty công bố chính thức lên mạng xã hội, portfolio cá nhân hoặc bất kỳ nền tảng công khai nào khi chưa được phép.
4. Áp dụng các biện pháp hợp lý để bảo vệ Thông tin bảo mật (không lưu trữ trên thiết bị/tài khoản cá nhân không an toàn, không chuyển tiếp cho người không có trách nhiệm liên quan).
5. Trả lại hoặc xóa bỏ toàn bộ Thông tin bảo mật khi chấm dứt hợp đồng/hợp tác, theo yêu cầu của Công ty.

Điều 3. Ngoại lệ
Nghĩa vụ bảo mật tại Điều 2 không áp dụng đối với thông tin:
1. Đã được công bố công khai không do lỗi của Bên B;
2. Bên B đã biết một cách hợp pháp trước khi nhận được từ Công ty;
3. Bắt buộc phải cung cấp theo yêu cầu của cơ quan nhà nước có thẩm quyền.

Điều 4. Quyền sở hữu trí tuệ
Mọi sản phẩm sáng tạo (bản vẽ, minh họa, thiết kế nhân vật, bố cục sách...) Bên B thực hiện trong phạm vi công việc/hợp tác với Công ty thuộc quyền sở hữu của Công ty, trừ trường hợp có thỏa thuận riêng bằng văn bản.

Điều 5. Thời hạn hiệu lực
Thỏa thuận này có hiệu lực kể từ ngày ký và tiếp tục có hiệu lực trong vòng 02 (hai) năm kể từ ngày Bên B chấm dứt hợp đồng/hợp tác với Công ty, áp dụng đối với các Thông tin bảo mật đã tiếp cận trong thời gian làm việc.

Điều 6. Xử lý vi phạm
Trường hợp vi phạm nghĩa vụ bảo mật gây thiệt hại cho Công ty, Bên B có trách nhiệm bồi thường thiệt hại thực tế theo quy định của pháp luật dân sự, không ảnh hưởng đến các trách nhiệm pháp lý khác (nếu có).

Điều 7. Điều khoản chung
1. Thỏa thuận này là một phần không tách rời của Hợp đồng lao động (nếu có) giữa hai bên.
2. Việc ký xác nhận điện tử của Bên B ở cuối văn bản này (chữ ký vẽ tay + họ tên + thời gian ký) có giá trị như chữ ký tay.
3. Mọi sửa đổi, bổ sung phải được lập thành văn bản và có chữ ký của hai bên.

Hai bên đã đọc, hiểu rõ và đồng ý ký kết thỏa thuận bảo mật này.$tpl$)
) as v(type, name, title, content)
where not exists (select 1 from public.staff_document_templates);
