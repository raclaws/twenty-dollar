import { makeAutoObservable } from 'mobx';

export class UIStore {
  selectedMonth: string;
  sidebarOpen: boolean = true;
  networkStatus: 'online' | 'offline' = 'online';
  commandPaletteOpen: boolean = false;
  activeAccountId: string | null = null;

  constructor() {
    this.selectedMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    makeAutoObservable(this);
  }

  setSelectedMonth(month: string): void {
    this.selectedMonth = month;
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  setSidebarOpen(open: boolean): void {
    this.sidebarOpen = open;
  }

  setNetworkStatus(status: 'online' | 'offline'): void {
    this.networkStatus = status;
  }

  setCommandPaletteOpen(open: boolean): void {
    this.commandPaletteOpen = open;
  }

  setActiveAccountId(id: string | null): void {
    this.activeAccountId = id;
  }
}
