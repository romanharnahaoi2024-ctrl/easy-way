export interface LoginErrors {
  email?: string;
  password?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PASSWORD_MIN = 8;

export function validateLogin(email: string, password: string): LoginErrors {
  const errors: LoginErrors = {};
  const e = email.trim();
  if (!e) errors.email = 'Вкажіть електронну пошту.';
  else if (!EMAIL_RE.test(e)) errors.email = 'Схоже, в адресі помилка. Приклад: name@easyway.lviv.ua';

  if (!password) errors.password = 'Вкажіть пароль.';
  else if (password.length < PASSWORD_MIN) errors.password = `Пароль має містити щонайменше ${PASSWORD_MIN} символів.`;
  return errors;
}

export const hasErrors = (e: LoginErrors) => Boolean(e.email || e.password);
