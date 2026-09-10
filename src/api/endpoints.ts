// uysot CRM API endpoints — reverse-engineered from the production app bundle.
// Base host + controller prefixes are stable; the analytics endpoints below
// power the same "statistics" module the native uysot dashboard uses.

export const API_BASE = 'https://api.service.app.uysot.uz';

export const ENDPOINTS = {
  auth: {
    signIn: '/v1/auth/sign-in',
    refresh: '/v1/auth/refresh',
    logout: '/v1/auth/logout',
    permission: '/v1/auth/permission',
  },
  building: {
    compact: '/v1/building/compact',
    all: '/v1/building/all',
    index: '/v1/building/',
  },
  house: {
    compact: '/v1/house/compact',
    index: '/v1/house/',
    onSale: '/v1/house/on-sale',
  },
  statistics: {
    // pipes available for the funnel / plan-fact analytics
    pipes: '/v1/statistics/plan-fact-pipe/pipe',
    // funnel: counts + days per pipeline stage
    customerFlow: '/v1/statistics/customer-flow/v2',
    // plan vs fact — lead counts by pipeline / source
    planFactPipe: '/v1/statistics/plan-fact-pipe',
    // plan vs fact — marketing cost by source / month
    planFactCost: '/v1/statistics/plan-fact-cost',
    // cost per single lead
    oneLeadCost: '/v1/statistics/plan-fact-pipe/one-lead-cost',
    // configured marketing spend
    leadAndClientCost: '/v1/statistics/lead-and-client-cost',
  },
  lead: {
    sources: '/v1/lead/sources',
    filter: '/v1/lead/filter',
    data: '/v1/lead/data',
  },
  pipe: {
    all: '/v1/pipe/all-by-permission',
    index: '/v1/pipe/',
  },
  pipeStatus: {
    all: '/v1/status/all',
  },
  contract: {
    filter: '/v1/contract/filter',
    amount: '/v1/contract/amount',
    monthlyPayment: '/v1/contract/monthly-payment',
    paymentFilter: '/v1/contract/payment/filter',
    paymentFilterSum: '/v1/contract/payment/filter/sum',
  },
  monetary: {
    paymentFilter: '/v1/monetary/payment/filter',
    paymentFilterCount: '/v1/monetary/payment/filter/count',
  },
  mobile: {
    saleStats: '/v1/mobile/sale/stats',
  },
} as const;
