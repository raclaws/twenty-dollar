import {
  Home, Building, Key, Sofa, Lightbulb, Droplets, Wifi,
  Car, Fuel, Bus, Bike, Plane, TrainFront,
  ShoppingCart, UtensilsCrossed, Coffee, Wine, Salad, Pizza,
  ShoppingBag, Shirt, Gift, Package, Store,
  Heart, Pill, Stethoscope, Dumbbell, Brain,
  Tv, Music, Gamepad2, Film, BookOpen, Palette,
  Receipt, Phone, Zap, Globe, Shield,
  PiggyBank, Target, TrendingUp, Gem, Star,
  Folder, Tag, Circle, Bookmark, Flag, MoreHorizontal,
  Landmark, Banknote, CreditCard,
} from 'lucide-solid'
import type { Component } from 'solid-js'

export interface IconDef {
  id: string
  icon: Component<{ size?: number }>
}

export interface IconGroup {
  label: string
  icons: IconDef[]
}

export const ICON_GROUPS: IconGroup[] = [
  { label: 'Housing', icons: [
    { id: 'home', icon: Home }, { id: 'building', icon: Building }, { id: 'key', icon: Key },
    { id: 'sofa', icon: Sofa }, { id: 'lightbulb', icon: Lightbulb }, { id: 'droplets', icon: Droplets }, { id: 'wifi', icon: Wifi },
  ]},
  { label: 'Transport', icons: [
    { id: 'car', icon: Car }, { id: 'fuel', icon: Fuel }, { id: 'bus', icon: Bus },
    { id: 'bike', icon: Bike }, { id: 'plane', icon: Plane }, { id: 'train-front', icon: TrainFront },
  ]},
  { label: 'Food', icons: [
    { id: 'shopping-cart', icon: ShoppingCart }, { id: 'utensils-crossed', icon: UtensilsCrossed },
    { id: 'coffee', icon: Coffee }, { id: 'wine', icon: Wine }, { id: 'salad', icon: Salad }, { id: 'pizza', icon: Pizza },
  ]},
  { label: 'Shopping', icons: [
    { id: 'shopping-bag', icon: ShoppingBag }, { id: 'shirt', icon: Shirt },
    { id: 'gift', icon: Gift }, { id: 'package', icon: Package }, { id: 'store', icon: Store },
  ]},
  { label: 'Health', icons: [
    { id: 'heart', icon: Heart }, { id: 'pill', icon: Pill },
    { id: 'stethoscope', icon: Stethoscope }, { id: 'dumbbell', icon: Dumbbell }, { id: 'brain', icon: Brain },
  ]},
  { label: 'Entertainment', icons: [
    { id: 'tv', icon: Tv }, { id: 'music', icon: Music }, { id: 'gamepad', icon: Gamepad2 },
    { id: 'film', icon: Film }, { id: 'book-open', icon: BookOpen }, { id: 'palette', icon: Palette },
  ]},
  { label: 'Bills', icons: [
    { id: 'receipt', icon: Receipt }, { id: 'phone', icon: Phone },
    { id: 'zap', icon: Zap }, { id: 'globe', icon: Globe }, { id: 'shield', icon: Shield },
  ]},
  { label: 'Savings', icons: [
    { id: 'piggy-bank', icon: PiggyBank }, { id: 'target', icon: Target },
    { id: 'trending-up', icon: TrendingUp }, { id: 'gem', icon: Gem }, { id: 'star', icon: Star },
  ]},
  { label: 'General', icons: [
    { id: 'folder', icon: Folder }, { id: 'tag', icon: Tag }, { id: 'circle', icon: Circle },
    { id: 'bookmark', icon: Bookmark }, { id: 'flag', icon: Flag }, { id: 'more-horizontal', icon: MoreHorizontal },
  ]},
]

const ICON_MAP = new Map<string, Component<{ size?: number }>>()
for (const group of ICON_GROUPS) {
  for (const def of group.icons) {
    ICON_MAP.set(def.id, def.icon)
  }
}

export const ACCOUNT_TYPE_ICONS: Record<string, Component<{ size?: number }>> = {
  checking: Landmark,
  savings: PiggyBank,
  cash: Banknote,
  credit: CreditCard,
}

export function getIconComponent(id: string | null | undefined): Component<{ size?: number }> | null {
  if (!id) return null
  return ICON_MAP.get(id) ?? null
}

const INITIAL_COLORS = [
  '#f38ba8', '#fab387', '#f9e2af', '#a6e3a1', '#94e2d5',
  '#89dceb', '#74c7ec', '#89b4fa', '#b4befe', '#cba6f7',
  '#f5c2e7', '#eba0ac',
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function getInitialColor(name: string): string {
  return INITIAL_COLORS[hashString(name) % INITIAL_COLORS.length]
}

export function getInitial(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  return trimmed.charAt(0).toUpperCase()
}
