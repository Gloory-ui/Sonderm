-- Скрипт для подтверждения email пользователя в Supabase
-- Выполните в Supabase SQL Editor → замените 'abdusattor621@gmail.com' на нужный email

-- Обновляем статус подтверждения email
UPDATE auth.users 
SET email_confirmed_at = NOW() 
WHERE email = 'abdusattor621@gmail.com';

-- Проверяем результат
SELECT id, email, email_confirmed_at 
FROM auth.users 
WHERE email = 'abdusattor621@gmail.com';
