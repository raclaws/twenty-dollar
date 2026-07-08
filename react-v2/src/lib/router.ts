import {
  createRouter,
  createRootRoute,
  createRoute,
  redirect,
} from '@tanstack/react-router';
import { RootLayout } from '@/routes/__root';
import { AuthenticatedLayout } from '@/routes/_authenticated';
import { LoginPage } from '@/routes/login';
import { SetupPage } from '@/routes/setup';
import { BudgetPage } from '@/routes/_authenticated/budget';
import { BudgetMonthPage } from '@/routes/_authenticated/budget.$month';
import { TransactionsPage } from '@/routes/_authenticated/transactions';
import { AccountsPage } from '@/routes/_authenticated/accounts';
import { SchedulesPage } from '@/routes/_authenticated/schedules';
import { ImportPage } from '@/routes/_authenticated/import';
import { SettingsLayout } from '@/routes/_authenticated/settings';
import { SettingsIndexPage } from '@/routes/_authenticated/settings/index-page';
import { SettingsCategoriesPage } from '@/routes/_authenticated/settings/categories';
import { SettingsPayeesPage } from '@/routes/_authenticated/settings/payees';
import { SettingsImportRulesPage } from '@/routes/_authenticated/settings/import-rules';
import { SettingsExportPage } from '@/routes/_authenticated/settings/export';
import { authStore } from '@/stores';

const rootRoute = createRootRoute({
  component: RootLayout,
});

// Public routes
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: () => {
    if (authStore.isAuthenticated) {
      throw redirect({ to: '/budget' });
    }
  },
  component: LoginPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  beforeLoad: () => {
    if (authStore.isAuthenticated) {
      throw redirect({ to: '/budget' });
    }
  },
  component: SetupPage,
});

// Authenticated layout route
const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  beforeLoad: () => {
    if (!authStore.isAuthenticated) {
      throw redirect({ to: '/login' });
    }
  },
  component: AuthenticatedLayout,
});

// Index redirect
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/budget' });
  },
});

// Authenticated child routes
const budgetRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/budget',
  component: BudgetPage,
});

const budgetMonthRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/budget/$month',
  component: BudgetMonthPage,
});

const transactionsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/transactions',
  component: TransactionsPage,
});

const accountsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/accounts',
  component: AccountsPage,
});

const schedulesRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/schedules',
  component: SchedulesPage,
});

const importRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/import',
  component: ImportPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/settings',
  component: SettingsLayout,
});

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/',
  component: SettingsIndexPage,
});

const settingsCategoriesRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/categories',
  component: SettingsCategoriesPage,
});

const settingsPayeesRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/payees',
  component: SettingsPayeesPage,
});

const settingsImportRulesRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/import-rules',
  component: SettingsImportRulesPage,
});

const settingsExportRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/export',
  component: SettingsExportPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  setupRoute,
  authenticatedRoute.addChildren([
    budgetRoute,
    budgetMonthRoute,
    transactionsRoute,
    accountsRoute,
    schedulesRoute,
    importRoute,
    settingsRoute.addChildren([
      settingsIndexRoute,
      settingsCategoriesRoute,
      settingsPayeesRoute,
      settingsImportRulesRoute,
      settingsExportRoute,
    ]),
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
