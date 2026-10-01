-- "Trưa nay ăn gì?": 32 quán nước (cà phê, trà sữa, nước ép, sinh tố, trà trái
-- cây, matcha) ở Tân Bình, Phú Nhuận, Q.3 — from Google Maps (1/10/2026),
-- every one with a phone number, open in the afternoon, with its drink and a
-- free Unsplash illustration. Running it again adds nothing twice.

insert into public.food_shops (name, address, phone, map_url, themes, opening_hours, price_min, price_max, near_office, dine_in, note)
select v.name, v.address, v.phone, v.map_url, v.themes, v.hours, v.pmin::int, v.pmax::int, v.near, v.dine, v.note
from (values
  ('Crea Coffee & Studio', '48/03 Út Tịch, Tân Sơn Nhất, TP. HCM', '0337 747 191', 'https://maps.google.com/?cid=546659148449467651', array['uong'], '08:00 - 23:00', null, 100000, true, true, 'Google ★4.8 (604 đánh giá) · cách văn phòng ~92 m'),
  ('CHẠM Cafe & Kem Bơ Đà Lạt - Cộng Hoà', '18 Cộng Hòa, Tân Sơn Nhất, TP. HCM', '0979 366 601', 'https://maps.google.com/?cid=1729563560622752737', array['uong'], '07:30 - 22:30', null, null, true, true, 'Google ★4.8 (549 đánh giá) · cách văn phòng ~480 m'),
  ('The Seat Cafe 2', '1355/7 Hoàng Sa, Tân Sơn Nhất, TP. HCM', '0987 160 175', 'https://maps.google.com/?cid=5386050207177210947', array['uong'], '09:00 - 22:00', null, 100000, true, true, 'Google ★4.9 (107 đánh giá) · cách văn phòng ~592 m'),
  ('Bông Trà Cộng Hoà', '99d Cộng Hòa, Tân Sơn Nhất, TP. HCM', '0353 868 467', 'https://maps.google.com/?cid=3763551462364159399', array['uong'], '09:00 - 23:00', null, 100000, true, true, 'Google ★4.8 (146 đánh giá) · cách văn phòng ~578 m'),
  ('Tiệm cà phê Mây Đá', '76 Đ. Xuân Diệu, Tân Sơn Nhất, TP. HCM', '0353 868 804', 'https://maps.google.com/?cid=6737984061340278901', array['uong'], '07:00 - 23:00', null, 100000, true, true, 'Google ★4.7 (129 đánh giá) · cách văn phòng ~426 m'),
  ('Highlands Coffee Vincom Cộng Hòa', '15-17 Cộng Hòa, Tân Sơn Nhất, TP. HCM', '028 7109 9677', 'https://maps.google.com/?cid=9308002573365214763', array['uong'], '07:00 - 22:00', null, 100000, true, true, 'Google ★4.2 (1676 đánh giá) · cách văn phòng ~394 m'),
  ('BULSAN COFFEE', '347 Nguyễn Trọng Tuyển, Tân Sơn Hòa, TP. HCM', '0932 376 579', 'https://maps.google.com/?cid=1779115505381051237', array['uong'], '07:00 - 22:00', null, 100000, false, true, 'Google ★4.7 (565 đánh giá) · cách văn phòng ~1.0 km'),
  ('Gờ cafe - Bùi Thị Xuân', '18 Bùi Thị Xuân, Tân Sơn Hòa, TP. HCM', '0345 750 007', 'https://maps.google.com/?cid=2433151103532883214', array['uong'], '06:00 - 22:00', null, 100000, true, true, 'Google ★4.4 (344 đánh giá) · cách văn phòng ~477 m'),
  ('Cà Phê Muối Huế Cao Loan', '406/3 Cộng Hòa, Tân Bình, TP. HCM', '0909 136 362', 'https://maps.google.com/?cid=14040535622684548442', array['uong'], '06:30 - 22:00', null, 100000, false, true, 'Google ★5 (375 đánh giá) · cách văn phòng ~1.7 km'),
  ('Trung Nguyên Legend Café', '15 Đường Huỳnh Lan Khanh, Tân Sơn Hòa, TP. HCM', '0773 771 515', 'https://maps.google.com/?cid=2753445091533027388', array['uong'], '07:00 - 22:00', null, 100000, false, true, 'Google ★4.9 (123 đánh giá) · cách văn phòng ~1.2 km'),
  ('Chạm Cafe (Clean and Roasted Coffee)', '33 Lê Trung Nghĩa, Bảy Hiền, TP. HCM', '0345 446 779', 'https://maps.google.com/?cid=14916632260198720431', array['uong'], '07:30 - 22:30', null, 100000, false, true, 'Google ★4.6 (233 đánh giá) · cách văn phòng ~813 m'),
  ('Hạ An Corner', '41/6 Đồng Xoài, Tân Bình, TP. HCM', '0764 910 789', 'https://maps.google.com/?cid=9223907743526063652', array['uong'], '08:30 - 22:00', null, 100000, false, true, 'Google ★4.9 (215 đánh giá) · cách văn phòng ~1.5 km'),
  ('Vibas Coffee', '67 Đ. Trần Quốc Hoàn, Tân Sơn Nhất, TP. HCM', '0981 530 909', 'https://maps.google.com/?cid=2998092203808123915', array['uong'], '07:00 - 23:00', null, 100000, false, true, 'Google ★4.4 (525 đánh giá) · cách văn phòng ~981 m'),
  ('Ulà Ngon - Trà Sữa Hạt Nông Sản, Matcha, Cafe Phin', '339/18A1 Đ. Lê Văn Sỹ, Nhiêu Lộc, TP. HCM', '0949 603 903', 'https://maps.google.com/?cid=1733625825549188345', array['uong'], '08:00 - 21:00', null, null, false, true, 'Google ★4.8 (211 đánh giá) · cách văn phòng ~2.3 km'),
  ('Trà Sữa Sunday Basic - Lê Văn Sỹ', '307 Đ. Lê Văn Sỹ, Tân Sơn Hòa, TP. HCM', '0938 588 307', 'https://maps.google.com/?cid=9154829749124186359', array['uong'], '07:30 - 22:00', null, null, false, true, 'Google ★4.2 (89 đánh giá) · cách văn phòng ~974 m'),
  ('Trà sữa MOCHI - Lê Văn Sỹ', '366 Đ. Lê Văn Sỹ, Quận 3, TP. HCM', '0763 247 366', 'https://maps.google.com/?cid=3750383337518672535', array['uong'], '10:00 - 22:00', null, null, false, true, 'Google ★4.8 (124 đánh giá) · cách văn phòng ~2.5 km'),
  ('Trà Sữa DABACHA - Hoa Sứ', '162 Hoa Lan, Cầu Kiệu, TP. HCM', '0326 469 790', 'https://maps.google.com/?cid=3183392910500984339', array['uong'], '08:00 - 22:30', null, 100000, false, true, 'Google ★4.8 (593 đánh giá) · cách văn phòng ~3.3 km'),
  ('Trà Sữa ToCoToCo 152 Nguyễn Phúc Nguyên', '152 Nguyễn Phúc Nguyên, Nhiêu Lộc, TP. HCM', '0849 216 022', 'https://maps.google.com/?cid=1259212541308222804', array['uong'], '08:30 - 22:30', null, null, false, true, 'Google ★4.7 (172 đánh giá) · cách văn phòng ~3.0 km'),
  ('Hồng Trà Sữa Ba Cô Gái Tam Hảo Nguyễn Phúc Nguyên', '126A Nguyễn Phúc Nguyên, Nhiêu Lộc, TP. HCM', '0798 078 062', 'https://maps.google.com/?cid=5621574821000587902', array['uong'], '08:00 - 23:00', null, 100000, false, true, 'Google ★4.7 (125 đánh giá) · cách văn phòng ~3.0 km'),
  ('ReViet Juice', '57 Thăng Long, Tân Sơn Nhất, TP. HCM', '0342 694 655', 'https://maps.google.com/?cid=3180314979087115034', array['uong', 'healthy'], '08:00 - 21:30', null, 100000, false, true, 'Google ★4.9 (303 đánh giá) · cách văn phòng ~707 m'),
  ('Sinh tố Phúc Long', '9 Phạm Văn Hai, Tân Sơn Hòa, TP. HCM', '0937 848 378', 'https://maps.google.com/?cid=1539469569915660359', array['uong', 'healthy'], '10:00 - 02:00', null, 100000, false, true, 'Google ★4.2 (207 đánh giá) · cách văn phòng ~724 m'),
  ('123 Juice - Nước ép trái cây tươi', '235/28 Nam Kỳ Khởi Nghĩa, Xuân Hòa, TP. HCM', '0902 439 123', 'https://maps.google.com/?cid=14026557777959691889', array['uong', 'healthy'], '09:00 - 21:00', null, 100000, false, true, 'Google ★4.8 (88 đánh giá) · cách văn phòng ~3.0 km'),
  ('Goodblend - Sinh tố healthy & Smoothie bowl', '25b2 Nguyễn Văn Đậu, Đức Nhuận, TP. HCM', '028 7108 4267', 'https://maps.google.com/?cid=244947292071762162', array['uong', 'healthy'], '06:00 - 22:00', null, 100000, false, true, 'Google ★4.9 (108 đánh giá) · cách văn phòng ~3.2 km'),
  ('Quán Sinh Tố 142', '140 Lý Chính Thắng, Xuân Hòa, TP. HCM', '028 3848 3574', 'https://maps.google.com/?cid=3433783415417866872', array['uong', 'healthy'], '08:00 - 22:30', null, 100000, false, true, 'Google ★4.3 (1317 đánh giá) · cách văn phòng ~3.1 km'),
  ('Trà Sang - Trà Trái Cây Đậm Vị', '87B Đ. Phùng Văn Cung, Cầu Kiệu, TP. HCM', '0909 332 912', 'https://maps.google.com/?cid=9188214139634772555', array['uong'], '09:00 - 21:30', null, 100000, false, true, 'Google ★5 (122 đánh giá) · cách văn phòng ~2.9 km'),
  ('Matcha Vibe - Nguyễn Minh Hoàng', '71 Đ. Nguyễn Minh Hoàng, Bảy Hiền, TP. HCM', '0327 139 271', 'https://maps.google.com/?cid=2698292970985028163', array['uong'], '07:00 - 22:00', null, 100000, false, true, 'Google ★5 (104 đánh giá) · cách văn phòng ~958 m'),
  ('Một Bát Trà - Matcha Houjicha Premium', '115/174B Đ. Lê Văn Sỹ, Phú Nhuận, TP. HCM', '0796 343 161', 'https://maps.google.com/?cid=15894204693695543739', array['uong'], '07:00 - 22:30', null, 100000, false, true, 'Google ★4.9 (651 đánh giá) · cách văn phòng ~1.6 km'),
  ('Matcha Phê Xỉu - Cafe & Matcha Phú Nhuận', '14 Hoàng Minh Giám, Đức Nhuận, TP. HCM', '0982 086 744', 'https://maps.google.com/?cid=6181149412332614508', array['uong'], '08:00 - 22:00', null, 100000, false, true, 'Google ★4.8 (144 đánh giá) · cách văn phòng ~2.1 km'),
  ('Phúc Long - Republic Plaza Cộng Hòa', 'Tòa Nhà Republic Plaza, 18E Cộng Hòa, Tân Sơn Nhất, TP. HCM', '028 3811 3000', 'https://maps.google.com/?cid=4384640788307923220', array['uong'], '07:00 - 21:00', null, null, true, true, 'Google ★4.1 (386 đánh giá) · cách văn phòng ~618 m'),
  ('KATINAT - Cộng Hòa', '20 Cộng Hòa, Tân Sơn Nhất, TP. HCM', '028 7304 7699', 'https://maps.google.com/?cid=13790172566394339870', array['uong'], '07:00 - 22:30', null, 100000, true, true, 'Google ★4 (1393 đánh giá) · cách văn phòng ~474 m'),
  ('Phê La - Đồng Đen', '103 Đồng Đen, Bảy Hiền, TP. HCM', '1900 3013', 'https://maps.google.com/?cid=10989501399634326141', array['uong'], '07:00 - 22:00', null, 100000, false, true, 'Google ★3.9 (535 đánh giá) · cách văn phòng ~1.6 km'),
  ('Tiệm Trà Mị Nương - Trà Trái Cây, Sinh Tố, Nước Ép', '1a1 Giải Phóng, Tân Sơn Nhất, TP. HCM', '0775 440 008', 'https://maps.google.com/?cid=14087199388286515974', array['uong'], '00:00 - 23:59', null, 100000, true, true, 'Google ★4.6 (19 đánh giá) · cách văn phòng ~594 m')
) as v(name, address, phone, map_url, themes, hours, pmin, pmax, near, dine, note)
where not exists (select 1 from public.food_shops s where s.name = v.name);

insert into public.food_shop_menu_items (shop_id, name, price, category, vegetarian, photo_url, photo_is_sample, sort_order)
select s.id, v.dish, null, 'uong', false, 'https://images.unsplash.com/photo-' || v.photo || '?w=800&q=70&auto=format&fit=crop', true, v.ord
from public.food_shops s
join (values
  ('Crea Coffee & Studio', 'Cà phê sữa đá', '1461023058943-07fcbe16d735', 1),
  ('CHẠM Cafe & Kem Bơ Đà Lạt - Cộng Hoà', 'Cà phê sữa đá', '1471922597728-92f81bfe2445', 1),
  ('The Seat Cafe 2', 'Cà phê sữa đá', '1461023058943-07fcbe16d735', 1),
  ('Bông Trà Cộng Hoà', 'Trà trái cây', '1597481499666-130f8eb2c9cd', 1),
  ('Tiệm cà phê Mây Đá', 'Cà phê sữa đá', '1471922597728-92f81bfe2445', 1),
  ('Highlands Coffee Vincom Cộng Hòa', 'Cà phê sữa đá', '1461023058943-07fcbe16d735', 1),
  ('BULSAN COFFEE', 'Cà phê sữa đá', '1471922597728-92f81bfe2445', 1),
  ('Gờ cafe - Bùi Thị Xuân', 'Cà phê sữa đá', '1461023058943-07fcbe16d735', 1),
  ('Cà Phê Muối Huế Cao Loan', 'Cà phê muối', '1517701550927-30cf4ba1dba5', 1),
  ('Trung Nguyên Legend Café', 'Cà phê sữa đá', '1471922597728-92f81bfe2445', 1),
  ('Chạm Cafe (Clean and Roasted Coffee)', 'Cà phê sữa đá', '1461023058943-07fcbe16d735', 1),
  ('Hạ An Corner', 'Cà phê sữa đá', '1471922597728-92f81bfe2445', 1),
  ('Vibas Coffee', 'Cà phê sữa đá', '1461023058943-07fcbe16d735', 1),
  ('Ulà Ngon - Trà Sữa Hạt Nông Sản, Matcha, Cafe Phin', 'Trà sữa hạt', '1558857563-b371033873b8', 1),
  ('Trà Sữa Sunday Basic - Lê Văn Sỹ', 'Trà sữa trân châu', '1558857563-b371033873b8', 1),
  ('Trà sữa MOCHI - Lê Văn Sỹ', 'Trà sữa trân châu', '1558857563-b371033873b8', 1),
  ('Trà Sữa DABACHA - Hoa Sứ', 'Trà sữa trân châu', '1558857563-b371033873b8', 1),
  ('Trà Sữa ToCoToCo 152 Nguyễn Phúc Nguyên', 'Trà sữa trân châu', '1558857563-b371033873b8', 1),
  ('Hồng Trà Sữa Ba Cô Gái Tam Hảo Nguyễn Phúc Nguyên', 'Trà sữa trân châu', '1558857563-b371033873b8', 1),
  ('ReViet Juice', 'Nước ép trái cây', '1603569283847-aa295f0d016a', 1),
  ('Sinh tố Phúc Long', 'Sinh tố', '1553530666-ba11a7da3888', 1),
  ('123 Juice - Nước ép trái cây tươi', 'Nước ép trái cây', '1600271886742-f049cd451bba', 1),
  ('Goodblend - Sinh tố healthy & Smoothie bowl', 'Sinh tố', '1553530666-ba11a7da3888', 1),
  ('Quán Sinh Tố 142', 'Sinh tố', '1553530666-ba11a7da3888', 1),
  ('Trà Sang - Trà Trái Cây Đậm Vị', 'Trà trái cây', '1597481499666-130f8eb2c9cd', 1),
  ('Matcha Vibe - Nguyễn Minh Hoàng', 'Matcha latte', '1749280447307-31a68eb38673', 1),
  ('Một Bát Trà - Matcha Houjicha Premium', 'Matcha latte', '1749280447307-31a68eb38673', 1),
  ('Matcha Phê Xỉu - Cafe & Matcha Phú Nhuận', 'Matcha latte', '1749280447307-31a68eb38673', 1),
  ('Phúc Long - Republic Plaza Cộng Hòa', 'Trà sữa', '1558857563-b371033873b8', 1),
  ('Phúc Long - Republic Plaza Cộng Hòa', 'Trà đào', '1597481499666-130f8eb2c9cd', 2),
  ('KATINAT - Cộng Hòa', 'Cà phê sữa đá', '1471922597728-92f81bfe2445', 1),
  ('Phê La - Đồng Đen', 'Trà sữa ô long', '1745883949374-baeba0ed57c3', 1),
  ('Tiệm Trà Mị Nương - Trà Trái Cây, Sinh Tố, Nước Ép', 'Trà trái cây', '1597481499666-130f8eb2c9cd', 1),
  ('Tiệm Trà Mị Nương - Trà Trái Cây, Sinh Tố, Nước Ép', 'Sinh tố', '1553530666-ba11a7da3888', 2)
) as v(shop, dish, photo, ord) on v.shop = s.name
where not exists (select 1 from public.food_shop_menu_items i where i.shop_id = s.id and i.name = v.dish);
