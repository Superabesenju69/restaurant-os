# Changelog — Restaurant OS

All notable changes to the Restaurant OS project will be documented in this file.

## [2026-10-20]
### Added
- Created atomic PostgreSQL RPC migration [20261020_atomic_stock_rpc.sql](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/supabase/migrations/20261020_atomic_stock_rpc.sql) (`public.adjust_item_stock(p_item_id UUID, p_delta NUMERIC)`) to eliminate read-then-write stock race conditions across concurrent POS terminals.
- Extracted root-level [CashRegisterModal.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/components/CashRegisterModal.tsx) component so the cash register drawer modal can be opened from any POS screen (including `HomeScreen`).
- Added responsive "Fit Screen / 100%" floor plan scaling toggle to both [TablesScreen.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/screens/TablesScreen.tsx) and the Dine-In table picker in [HomeScreen.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/screens/HomeScreen.tsx).
- Added responsive mobile/portrait-tablet top bar, collapsible sidebar drawer, and backdrop to [Dashboard.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/admin-web/src/app/Dashboard.tsx).
- Added responsive compact/portrait POS mode (`Menu` vs. `Cart` pane switcher and dynamic `numColumns` grid calculation via `useWindowDimensions()`) in [App.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/App.tsx).

### Changed
- **Zero-Latency In-Memory Cart Addition**: Refactored `addToCart` in [posStore.ts](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/store/posStore.ts) to resolve product/combo recipes directly from in-memory `recipes`, `items`, and `allIngredients` arrays and accept a `quantity` parameter, eliminating sequential Supabase network round-trips on every tap.
- **Zustand Architecture Compliance (`zustand-store-ts`)**: Separated `PosState` and `PosActions` interfaces, wrapped [posStore.ts](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/store/posStore.ts) with `subscribeWithSelector` middleware, and refactored [App.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/App.tsx), [HomeScreen.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/screens/HomeScreen.tsx), [TablesScreen.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/screens/TablesScreen.tsx), [OrdersScreen.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/screens/OrdersScreen.tsx), and [ServingScreen.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/screens/ServingScreen.tsx) to use individual Zustand state/action selectors instead of full-store destructuring.
- **Optimistic + Atomic Inventory Deduction**: Updated `applyStockChanges` and `buildDeductionMap` in [inventoryService.ts](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/services/inventoryService.ts) to skip untracked items in memory, apply optimistic local Zustand stock updates immediately, and execute atomic stock adjustments via `supabase.rpc('adjust_item_stock', ...)` with graceful fallback.
- **Memoized List & Report Computations**: Wrapped filtered lists and aggregations in `useMemo` across [TablesScreen.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/screens/TablesScreen.tsx), [OrdersScreen.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/screens/OrdersScreen.tsx), [ServingScreen.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/screens/ServingScreen.tsx), [ReportsTab.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/admin-web/src/components/tabs/ReportsTab.tsx), and [KDSClient.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/admin-web/src/app/kds/KDSClient.tsx).

### Fixed
- Fixed Cash Register button in [HomeScreen.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/screens/HomeScreen.tsx) not opening the register modal due to early screen return in `App.tsx`.
- Fixed Zone Filter tabs in [TablesScreen.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/screens/TablesScreen.tsx) comparing `zone.name` against `table.zone` UUIDs; now matches both zone `id` and `name`.
- Fixed Void Order confirmation in [OrdersScreen.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/screens/OrdersScreen.tsx) crashing on native iOS/Android by using `Platform.OS === 'web' ? window.confirm(...) : Alert.alert(...)`.
- Fixed `justifycontent` typo and absolute top-bar overlap in [HomeScreen.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/screens/HomeScreen.tsx).
- Fixed Quantity Picker in [App.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/App.tsx) creating `N` separate `quantity: 1` cart rows and firing `N` `saveOrder` calls.
- Fixed `ReportsTab` and `CajaTab` rendering outside the main container and loading guard in [Dashboard.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/admin-web/src/app/Dashboard.tsx), and consolidated the duplicate inline `Users` tab into [UsersTab.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/admin-web/src/components/tabs/UsersTab.tsx) with `waiter` and `cashier` roles.
- Removed unused `react-toastify` import in [CajaTab.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/admin-web/src/components/tabs/CajaTab.tsx) that caused a TypeScript error.
- Made RLS policy creation idempotent (`DROP POLICY IF EXISTS`) in [20260627_cash_shifts.sql](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/supabase/migrations/20260627_cash_shifts.sql).

## [2026-06-27]
### Added
- Created cash shifts database migrations [20260627_cash_shifts.sql](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/supabase/migrations/20260627_cash_shifts.sql).
- Implemented `activeCashShift` state and queries/actions (`fetchActiveCashShift`, `openCashShift`, `closeCashShift`, `addCashAdjustment`, `fetchCashShiftSummary`) in [posStore.ts](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/store/posStore.ts).
- Integrated cashier checkout blocker guard and cash drawer control panel UI modal in [App.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/App.tsx).
- Added a dynamic status/action button in [HomeScreen.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/pos-app/src/screens/HomeScreen.tsx).
- Added Cash Register Shifts reporting sub-tab and details popup window in [ReportsTab.tsx](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/admin-web/src/components/tabs/ReportsTab.tsx) with translations support.

## [2026-06-26]
### Added
- Created comprehensive developer handover and technical guide: [DOCUMENTATION.md](file:///Users/abrahammartinez/.gemini/antigravity/scratch/restaurant-os/DOCUMENTATION.md).
- Installed workspace-scoped skills under `.agents/skills/`:
  - `zustand-store-ts`: Standardizes global state architecture patterns.
  - `code-change-tracker`: Enforces change logs, performance rules, and documentation updates.
