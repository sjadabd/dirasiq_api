-- Alter invoice-related date columns to VARCHAR(10) (YYYY-MM-DD) idempotently

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_invoices' AND column_name = 'invoice_date' AND data_type <> 'character varying'
  ) THEN
    ALTER TABLE course_invoices
      ALTER COLUMN invoice_date TYPE VARCHAR(10) USING ((invoice_date)::date)::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_invoices' AND column_name = 'due_date' AND data_type <> 'character varying'
  ) THEN
    ALTER TABLE course_invoices
      ALTER COLUMN due_date TYPE VARCHAR(10) USING ((due_date)::date)::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_invoices' AND column_name = 'paid_date' AND data_type <> 'character varying'
  ) THEN
    ALTER TABLE course_invoices
      ALTER COLUMN paid_date TYPE VARCHAR(10) USING ((paid_date)::date)::text;
  END IF;

  -- Set default for invoice_date to current date as string (safe even if already set)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_invoices' AND column_name = 'invoice_date'
  ) THEN
    ALTER TABLE course_invoices
      ALTER COLUMN invoice_date SET DEFAULT (CURRENT_DATE)::text;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_installments' AND column_name = 'due_date' AND data_type <> 'character varying'
  ) THEN
    ALTER TABLE invoice_installments
      ALTER COLUMN due_date TYPE VARCHAR(10) USING ((due_date)::date)::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_installments' AND column_name = 'paid_date' AND data_type <> 'character varying'
  ) THEN
    ALTER TABLE invoice_installments
      ALTER COLUMN paid_date TYPE VARCHAR(10) USING ((paid_date)::date)::text;
  END IF;
END $$;
