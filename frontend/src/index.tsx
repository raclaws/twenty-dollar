/* @refresh reload */
import { render } from 'solid-js/web'
import { Router, Route } from '@solidjs/router'
import App from './App'
import BudgetView from './views/budget/BudgetView'
import AccountsView from './views/accounts/AccountsView'
import TransactionsView from './views/accounts/TransactionsView'
import SettingsView from './views/settings/SettingsView'
import LoginView from './views/auth/LoginView'
import SetupView from './views/auth/SetupView'
import './styles/global.css'
import './styles/components.css'
import './styles/budget.css'
import './styles/accounts.css'
import './styles/transactions.css'
import './styles/entity-picker.css'
import './styles/datepicker.css'
import './styles/settings.css'
import './styles/auth.css'
import './styles/icon-picker.css'

render(
  () => (
    <Router root={App}>
      <Route path="/login" component={LoginView} />
      <Route path="/setup" component={SetupView} />
      <Route path="/" component={BudgetView} />
      <Route path="/transactions" component={TransactionsView} />
      <Route path="/accounts" component={AccountsView} />
      <Route path="/settings" component={SettingsView} />
    </Router>
  ),
  document.getElementById('app')!,
)
