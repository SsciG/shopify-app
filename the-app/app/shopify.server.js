import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.April26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || process.env.HOST || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  // Public App Store app — required for App Store listing/review.
  // (Was ShopCustom, which uses a custom-app install flow that breaks the
  //  App Store reviewer's install and fails the "critical errors" check.)
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  billing: {
    "Starter": {
      lineItems: [
        {
          amount: 4.99,
          currencyCode: "USD",
          interval: "EVERY_30_DAYS",
        },
      ],
    },
    "Pro": {
      lineItems: [
        {
          amount: 39.99,
          currencyCode: "USD",
          interval: "EVERY_30_DAYS",
        },
      ],
    },
    "Enterprise": {
      lineItems: [
        {
          amount: 49.99,
          currencyCode: "USD",
          interval: "EVERY_30_DAYS",
        },
      ],
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.April26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
