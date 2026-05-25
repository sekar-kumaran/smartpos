/**
 * SmartPOS AI – Type Definitions
 * Mirrors the Pydantic schemas from the backend.
 */

// ─── Auth ──────────────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'manager' | 'cashier';

export interface User {
  id:         number;
  name:       string;
  email:      string;
  phone?:     string;
  role:       UserRole;
  is_active:  boolean;
  store_id?:  number;
  created_at: string;
}

export interface TokenResponse {
  access_token:  string;
  refresh_token: string;
  token_type:    string;
  expires_in:    number;
  user_id:       number;
  role:          UserRole;
}

export interface LoginPayload {
  email:    string;
  password: string;
}

// ─── Product / Inventory ──────────────────────────────────────────────────

export interface Product {
  id:            number;
  store_id:      number;
  category_id?:  number | null;
  name:          string;
  brand?:        string;
  sku?:          string | null;
  barcode?:      string | null;
  default_barcode?: string | null;
  hsn_code?:     string | null;
  unit:          string;
  cost_price:    number;
  selling_price: number;
  mrp?:          number | null;
  tax_rate:      number;
  gst_rate?:     number;
  cess_rate?:    number;
  price_includes_tax?: boolean;
  stock_qty:     number;
  total_stock?:  number;
  min_stock_qty: number;
  reorder_qty?:  number;
  has_variants?: boolean;
  is_active:     boolean;
  margin_pct?:   number;
  variants?:     ProductVariant[];
  created_at:    string;
}

export interface ProductVariant {
  id:           number;
  variant_name: string;
  stock_qty:    number;
  is_active:    boolean;
}

export interface Category {
  id:   number;
  name: string;
}

export interface InventoryHealth {
  total_products:        number;
  low_stock_count:       number;
  out_of_stock_count:    number;
  overstock_count:       number;
  total_inventory_value: number;
}

// ─── Price Categories ─────────────────────────────────────────────────────

export interface PriceCategory {
  id:          number;
  store_id:    number;
  name:        string;
  description?: string;
  color:       string;
  is_default:  boolean;
  is_active:   boolean;
  created_at:  string;
}

// ─── Customer ─────────────────────────────────────────────────────────────

export interface Customer {
  id:                  number;
  store_id:            number;
  name:                string;
  phone?:              string;
  address?:            string;
  price_category_id?:  number | null;
  price_category_name?: string | null;
  total_credit_given:  number;
  total_credit_repaid: number;
  outstanding_balance: number;
  created_at:          string;
}

// ─── Shift ────────────────────────────────────────────────────────────────

export type ShiftStatus = 'open' | 'closed';

export interface ShiftSession {
  id:             number;
  store_id:       number;
  opened_by_id:   number;
  closed_by_id?:  number;
  opened_at:      string;
  closed_at?:     string;
  opening_cash:   number;
  closing_cash?:  number;
  expected_cash?: number;
  total_sales:    number;
  total_revenue:  number;
  cash_sales:     number;
  upi_sales:      number;
  card_sales:     number;
  credit_sales:   number;
  cash_variance?: number;
  notes?:         string;
  status:         ShiftStatus;
  opened_by_name?: string;
}

// ─── Demand Forecast ──────────────────────────────────────────────────────

export interface DemandForecastItem {
  product_id:         number;
  product_name:       string;
  current_stock:      number;
  avg_daily_sales:    number;
  days_of_stock_left?: number;
  forecast_7d:        number;
  reorder_suggested:  boolean;
  reorder_qty:        number;
  stockout_date?:     string;
}

// ─── Billing ──────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'credit';

export interface CartItem {
  product:    Product;
  qty:        number;
  unit_price: number;
  discount:   number;
  line_total: number;
}

export interface SaleItemPayload {
  product_id: number;
  qty:        number;
  unit_price?: number;
  discount:   number;
}

export interface CreateSalePayload {
  store_id:       number;
  customer_id?:   number;
  items:          SaleItemPayload[];
  payment_method: PaymentMethod;
  discount:       number;
  amount_paid?:   number;
  notes?:         string;
  local_id?:      string;  // UUID for offline dedup
}

export interface SaleItem {
  id:          number;
  product_id:  number;
  qty:         number;
  unit_price:  number;
  cost_price:  number;
  tax_rate:    number;
  discount:    number;
  line_total:  number;
}

export type SaleStatus = 'completed' | 'refunded' | 'void';

export interface Sale {
  id:             number;
  store_id:       number;
  cashier_id:     number;
  customer_id?:   number;
  invoice_number: string;
  invoice_date?:  string;
  subtotal:       number;
  taxable_amount?: number;
  cgst_amount?:   number;
  sgst_amount?:   number;
  igst_amount?:   number;
  cess_amount?:   number;
  total_tax?:     number;
  round_off?:     number;
  tax_amount:     number;
  discount:       number;
  total_amount:   number;
  payment_method: PaymentMethod;
  amount_paid:    number;
  amount_due:     number;
  status:         SaleStatus;
  notes?:         string;
  is_synced:      boolean;
  items:          SaleItem[];
  created_at:     string;
}

// ─── Credit ───────────────────────────────────────────────────────────────

export type CreditStatus = 'open' | 'partial' | 'paid' | 'overdue';

export interface Credit {
  id:            number;
  store_id:      number;
  customer_id:   number;
  sale_id?:      number;
  amount:        number;
  amount_repaid: number;
  balance:       number;
  due_date?:     string;
  status:        CreditStatus;
  notes?:        string;
  created_at:    string;
}

export interface CreditExposure {
  total_outstanding: number;
  overdue_amount:    number;
  customer_count:    number;
  overdue_count:     number;
}

// ─── Analytics ────────────────────────────────────────────────────────────

export interface ProfitSummary {
  period:              string;
  total_revenue:       number;
  total_cost:          number;
  gross_profit:        number;
  gross_margin_pct:    number;
  total_transactions:  number;
  avg_basket_value:    number;
}

export interface DashboardSummary {
  profit:    ProfitSummary;
  inventory: InventoryHealth;
  credit:    CreditExposure;
  alerts:    Alert[];
}

// ─── Alerts ───────────────────────────────────────────────────────────────

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertType =
  | 'profit_drop'
  | 'low_stock'
  | 'out_of_stock'
  | 'overdue_credit'
  | 'anomaly'
  | 'fraud_suspect'
  | 'expiry_alert'
  | 'reorder'
  | 'price_change';

export interface Alert {
  id:          number;
  store_id:    number;
  alert_type:  AlertType;
  severity:    AlertSeverity;
  title:       string;
  description: string;
  is_read:     boolean;
  is_resolved: boolean;
  created_at:  string;
}

// ─── Pagination ───────────────────────────────────────────────────────────

export interface Paginated<T> {
  total:     number;
  page:      number;
  page_size: number;
  items:     T[];
}

export interface RevenueTrendPoint {
  date:         string;
  revenue:     number;
  profit?:     number;
  transactions?: number;
}

export interface TopProduct {
  product_name: string;
  qty_sold:     number;
  revenue:      number;
  profit?:      number;
}

export interface HeatmapPoint {
  hour:         number;
  transactions: number;
  revenue:      number;
}

export interface Supplier {
  id:             number;
  store_id:       number;
  name:           string;
  contact_person?: string | null;
  phone?:         string | null;
  email?:         string | null;
  address?:       string | null;
  gstin?:         string | null;
  credit_days?:   number;
  is_active:      boolean;
  created_at:     string;
}

export type PurchaseOrderStatus = 'draft' | 'sent' | 'partial_received' | 'received' | 'cancelled';

// ─── Loyalty ──────────────────────────────────────────────────────────────────

export interface LoyaltyConfig {
  enabled:               boolean;
  points_per_rupee:      number;   // e.g. 1 point per ₹10
  rupees_per_point:      number;   // e.g. 1 point = ₹0.10 redemption
  min_redemption_points: number;
  max_redemption_pct:    number;   // max % of bill redeemable
}

export interface CustomerLoyalty {
  customer_id:    number;
  customer_name:  string;
  phone?:         string;
  total_points:   number;
  redeemed_points: number;
  available_points: number;
  tier:           'bronze' | 'silver' | 'gold' | 'platinum';
  total_spent:    number;
  last_txn_date?: string;
}

export interface LoyaltyTransaction {
  id:          number;
  customer_id: number;
  points:      number;
  type:        'earned' | 'redeemed' | 'expired' | 'bonus';
  description: string;
  sale_id?:    number;
  created_at:  string;
}

export interface PurchaseOrder {
  id:             number;
  store_id:       number;
  supplier_id:    number;
  po_number:      string;
  status:         PurchaseOrderStatus;
  subtotal:       number;
  tax_amount:     number;
  total_amount:   number;
  expected_date?: string | null;
  received_date?: string | null;
  notes?:         string | null;
  items:          unknown[];
  created_at:     string;
}
