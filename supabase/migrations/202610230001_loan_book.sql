-- Counter loan book for Microcredit and Banking desks.
-- Borrowers do not log in. The manager or teller records disbursement and repayments.

create table if not exists public.loan_borrowers (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  full_name text not null,
  phone text,
  address text,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loan_borrowers_name_not_blank check (char_length(trim(full_name)) > 0)
);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  display_code text not null unique,
  department_id uuid not null references public.departments(id) on delete restrict,
  borrower_id uuid not null references public.loan_borrowers(id) on delete restrict,
  principal numeric(14, 2) not null,
  total_due numeric(14, 2) not null,
  outstanding numeric(14, 2) not null,
  total_paid numeric(14, 2) not null default 0,
  installment_amount numeric(14, 2),
  frequency text not null default 'weekly',
  purpose text,
  status text not null default 'active',
  disbursed_on date not null default current_date,
  next_due_on date,
  entered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loans_principal_positive check (principal > 0),
  constraint loans_total_due_check check (total_due >= principal),
  constraint loans_outstanding_nonnegative check (outstanding >= 0),
  constraint loans_paid_nonnegative check (total_paid >= 0),
  constraint loans_frequency_check check (frequency in ('weekly', 'monthly', 'lump_sum')),
  constraint loans_status_check check (status in ('active', 'paid', 'defaulted'))
);

create table if not exists public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete restrict,
  paid_on date not null default current_date,
  amount numeric(14, 2) not null,
  method text not null default 'cash',
  note text,
  received_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint loan_payments_amount_positive check (amount > 0),
  constraint loan_payments_method_check check (method in ('cash', 'transfer', 'pos'))
);

create index if not exists loan_borrowers_department_name_idx
  on public.loan_borrowers(department_id, full_name);
create index if not exists loan_borrowers_phone_idx
  on public.loan_borrowers(department_id, phone);
create index if not exists loans_department_status_idx
  on public.loans(department_id, status, disbursed_on desc);
create index if not exists loans_borrower_idx
  on public.loans(borrower_id, created_at desc);
create index if not exists loan_payments_loan_date_idx
  on public.loan_payments(loan_id, paid_on desc);

drop trigger if exists set_loan_borrowers_updated_at on public.loan_borrowers;
create trigger set_loan_borrowers_updated_at
before update on public.loan_borrowers
for each row execute function public.set_updated_at();

drop trigger if exists set_loans_updated_at on public.loans;
create trigger set_loans_updated_at
before update on public.loans
for each row execute function public.set_updated_at();

alter table public.loan_borrowers enable row level security;
alter table public.loans enable row level security;
alter table public.loan_payments enable row level security;

drop policy if exists loan_borrowers_select on public.loan_borrowers;
create policy loan_borrowers_select on public.loan_borrowers
for select to authenticated
using (
  public.is_executive()
  or public.current_profile_role() in ('director_of_administration', 'managing_director')
  or department_id = public.current_profile_department_id()
  or (
    public.current_profile_role() = 'executive_director'
    and public.department_in_caller_subsidiary(department_id)
  )
);

drop policy if exists loan_borrowers_write on public.loan_borrowers;
create policy loan_borrowers_write on public.loan_borrowers
for all to authenticated
using (
  public.is_executive()
  or public.current_profile_role() in ('director_of_administration', 'manager', 'department_head', 'executive_director')
)
with check (
  public.is_executive()
  or department_id = public.current_profile_department_id()
  or (
    public.current_profile_role() = 'executive_director'
    and public.department_in_caller_subsidiary(department_id)
  )
  or public.current_profile_role() = 'director_of_administration'
);

drop policy if exists loans_select on public.loans;
create policy loans_select on public.loans
for select to authenticated
using (
  public.is_executive()
  or public.current_profile_role() in ('director_of_administration', 'managing_director')
  or department_id = public.current_profile_department_id()
  or (
    public.current_profile_role() = 'executive_director'
    and public.department_in_caller_subsidiary(department_id)
  )
);

drop policy if exists loans_write on public.loans;
create policy loans_write on public.loans
for all to authenticated
using (
  public.is_executive()
  or public.current_profile_role() in ('director_of_administration', 'manager', 'department_head', 'executive_director')
)
with check (
  public.is_executive()
  or department_id = public.current_profile_department_id()
  or (
    public.current_profile_role() = 'executive_director'
    and public.department_in_caller_subsidiary(department_id)
  )
  or public.current_profile_role() = 'director_of_administration'
);

drop policy if exists loan_payments_select on public.loan_payments;
create policy loan_payments_select on public.loan_payments
for select to authenticated
using (
  public.is_executive()
  or public.current_profile_role() in ('director_of_administration', 'managing_director')
  or department_id = public.current_profile_department_id()
  or (
    public.current_profile_role() = 'executive_director'
    and public.department_in_caller_subsidiary(department_id)
  )
);

drop policy if exists loan_payments_insert on public.loan_payments;
create policy loan_payments_insert on public.loan_payments
for insert to authenticated
with check (
  public.is_executive()
  or department_id = public.current_profile_department_id()
  or (
    public.current_profile_role() = 'executive_director'
    and public.department_in_caller_subsidiary(department_id)
  )
  or public.current_profile_role() = 'director_of_administration'
);
