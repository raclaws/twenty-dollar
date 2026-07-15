/* @refresh reload */
if (typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`
  }
}

import { render } from 'solid-js/web'
import { Router, Route } from '@solidjs/router'
import App from './App'
import BudgetView from './views/budget/BudgetView'
import AccountsView from './views/accounts/AccountsView'
import TransactionsView from './views/accounts/TransactionsView'
import SettingsView from './views/settings/SettingsView'
import ImportView from './views/import/ImportView'
import SchedulesView from './views/schedules/SchedulesView'
import LoginView from './views/auth/LoginView'
import SetupView from './views/auth/SetupView'
import DesignSample from './views/DesignSample'
import './styles/global.css'
import './styles/components.css'
import './styles/budget.css'
import './styles/accounts.css'
import './styles/transactions.css'
import './styles/entity-picker.css'
import './styles/datepicker.css'
import './styles/settings.css'
import './styles/import.css'
import './styles/schedules.css'
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
      <Route path="/import" component={ImportView} />
      <Route path="/recurring" component={SchedulesView} />
      <Route path="/settings" component={SettingsView} />
      <Route path="/design" component={DesignSample} />
    </Router>
  ),
  document.getElementById('app')!,
)

document.getElementById('splash')?.remove()
