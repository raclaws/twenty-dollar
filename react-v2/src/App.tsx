import { RouterProvider } from '@tanstack/react-router';
import { router } from '@/lib/router';

export function App() {
  return <RouterProvider router={router} />;
}
