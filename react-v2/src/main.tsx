import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from '@/lib/store-context';
import { rootStore, initializeStores } from '@/stores';
import './index.css';

async function bootstrap() {
  await initializeStores();

  const container = document.getElementById('root');
  if (!container) throw new Error('Root element not found');

  createRoot(container).render(
    <StrictMode>
      <StoreProvider value={rootStore}>
        <App />
      </StoreProvider>
    </StrictMode>
  );
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap app:', err);
});
