
UPDATE auth.users
SET encrypted_password = extensions.crypt('SuperAdmin@2025', extensions.gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE email = 'admin@nawisaadi.com';


