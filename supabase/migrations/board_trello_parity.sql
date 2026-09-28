-- Run once in the Supabase Dashboard SQL Editor. Safe to re-run.
-- Trello's "hoàn tất" tick on a card's due date: the date badge turns green
-- and the card stops counting as overdue. Until this runs the board works
-- as before; only the tick itself asks for this file.

alter table public.tasks add column if not exists due_complete boolean not null default false;

-- Cards already ticked "hoàn tất" on Trello (export of 2026-09-29), matched
-- to the web board by title. Only ever sets the flag, never clears one.
update public.tasks set due_complete = true
where due_date is not null and due_complete = false and code in (
  '#1024','#1026','#1054','#1077','#1080','#1116','#1121','#1128','#1133','#1138','#1148','#1158','#1170','#1280','#1293',
  '#1296','#1360','#1366','#1377','#1399','#1408','#1410','#1413','#1425','#1427','#1444','#1447','#1451','#1465','#1466',
  '#1467','#1468','#1469','#1479','#1483','#1485','#1486','#1487','#1490','#1497','#1499','#1500','#1502','#1503','#1507',
  '#1509','#1511','#1512','#1514','#1517','#1518','#1519','#1520','#1522','#1523','#1524','#1528','#1529','#1535','#1536',
  '#1537','#1539','#1540','#1541','#1543','#1544','#1545','#1558'
);
