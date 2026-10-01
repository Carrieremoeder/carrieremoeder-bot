-- Run as administrator; SET ROLE exercises real test-role permissions.
-- Test rows are rolled back. No customer rows are read.
begin;
-- Supabase's postgres administrator is not a superuser. This temporary
-- membership permits SET ROLE and is undone with the test transaction.
grant bot_payment_test_runner to postgres;
set local statement_timeout = '15s';
set local role bot_payment_test_runner;
do $$
declare n integer; blocked boolean;
begin
  perform bot_payment_test.record_purchase('987654321001','987654321002','smoke@example.invalid','987654321003',repeat('a',64));
  perform bot_payment_test.record_purchase('987654321001','987654321002','smoke@example.invalid','987654321003',repeat('a',64));
  select count(*) into n from bot_payment_test.purchase_inbox where order_item_id='987654321001';
  if n<>1 then raise exception 'Duplicate handling failed'; end if;
  blocked:=false;
  begin
    perform bot_payment_test.record_purchase('987654321001','987654321002','other@example.invalid','987654321003',repeat('a',64));
  exception when raise_exception then
    if sqlerrm='Purchase identity conflict' then blocked:=true; else raise; end if;
  end;
  if not blocked then raise exception 'Conflicting identity accepted'; end if;
  blocked:=false;
  begin
    perform bot_payment_test.record_purchase('987654321004','987654321002','person@example.com','987654321003',repeat('a',64));
  exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'Real email accepted'; end if;
  blocked:=false;
  begin perform 1 from public.codes where false;
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Production code access allowed'; end if;
  blocked:=false;
  begin perform 1 from public.chat where false;
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Production conversation access allowed'; end if;
  blocked:=false;
  begin perform 1 from auth.users where false;
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Production account access allowed'; end if;
  blocked:=false;
  begin update bot_payment_test.purchase_inbox set email='other@example.invalid' where false;
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Test evidence mutable'; end if;
end $$;
reset role;
rollback;
select 'PASS: duplicate, conflict, synthetic email and isolation checks' as test_result,
  (select rolcanlogin from pg_roles where rolname='bot_payment_test_runner') as test_role_can_login,
  (select count(*) from bot_payment_test.purchase_inbox where order_item_id in ('987654321001','987654321004')) as remaining_test_rows;
