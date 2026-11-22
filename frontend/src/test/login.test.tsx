import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { AppRoutes } from '../App';
import { DEMO_PASSWORD, DEMO_USERS } from '../api/mock';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('Екран входу (EZW-48)', () => {
  it('без сесії перенаправляє захищену сторінку на вхід', async () => {
    renderAt('/audit');
    expect(await screen.findByRole('heading', { name: 'Вхід до EasyWay' })).toBeInTheDocument();
  });

  it('показує помилки валідації і не відправляє форму', async () => {
    const user = userEvent.setup();
    renderAt('/login');
    await user.click(await screen.findByRole('button', { name: 'Увійти' }));
    expect(screen.getByText('Вкажіть електронну пошту.')).toBeInTheDocument();
    expect(screen.getByText('Вкажіть пароль.')).toBeInTheDocument();
    expect(screen.getByLabelText('Електронна пошта')).toHaveAttribute('aria-invalid', 'true');
  });

  it('повідомляє про невірний пароль', async () => {
    const user = userEvent.setup();
    renderAt('/login');
    await user.type(await screen.findByLabelText('Електронна пошта'), DEMO_USERS.consumer.email);
    await user.type(screen.getByLabelText('Пароль'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(await screen.findByText('Невірна електронна пошта або пароль.')).toBeInTheDocument();
  });

  it('пускає аудитора й відкриває журнал аудиту, меню — лише дозволені розділи', async () => {
    const user = userEvent.setup();
    renderAt('/login');
    await user.type(await screen.findByLabelText('Електронна пошта'), DEMO_USERS.auditor.email);
    await user.type(screen.getByLabelText('Пароль'), DEMO_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(await screen.findByRole('heading', { name: 'Журнал аудиту' }, { timeout: 3000 })).toBeInTheDocument();
    const nav = screen.getByRole('complementary', { name: 'Головне меню' });
    expect(within(nav).getByRole('link', { name: /Журнал аудиту/ })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /Подання даних/ })).not.toBeInTheDocument();
  });

  it('демо-кнопка ролі підставляє облікові дані, а заборонений розділ веде на 403', async () => {
    const user = userEvent.setup();
    const view = renderAt('/login');
    await user.click(await screen.findByRole('button', { name: /Споживач/ }));
    expect(screen.getByLabelText('Електронна пошта')).toHaveValue(DEMO_USERS.consumer.email);
    await user.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(await screen.findByRole('heading', { name: 'Мапа транспорту' }, { timeout: 3000 })).toBeInTheDocument();
    // сесія живе в sessionStorage вкладки — відкриваємо чужий розділ напряму за адресою
    view.unmount();
    renderAt('/audit');
    expect(await screen.findByRole('heading', { name: 'У вас немає прав на цей розділ' }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('Адміністратор даних або Аудитор')).toBeInTheDocument();
  });

  it('вихід завершує сесію й повертає на екран входу', async () => {
    const user = userEvent.setup();
    renderAt('/login');
    await user.click(await screen.findByRole('button', { name: /Перевізник/ }));
    await user.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(await screen.findByRole('heading', { name: 'Подання даних' }, { timeout: 3000 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Вийти з системи' }));
    expect(await screen.findByRole('heading', { name: 'Вхід до EasyWay' })).toBeInTheDocument();
    expect(sessionStorage.getItem('easyway.session')).toBeNull();
    expect(localStorage.getItem('easyway.session')).toBeNull();
  });
});
