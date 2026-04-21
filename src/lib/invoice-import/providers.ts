import {
  MeritCredentials,
  SmartAccountsCredentials,
} from "../accounting-provider-types";
import {
  AccountingProviderActivities,
  AnyAccountingProviderActivities,
} from "../accounting-provider-activities";
import { meritProviderAdapter } from "../merit";
import { smartAccountsProviderAdapter } from "../smartaccounts";
import { StoredAccountingConnection } from "../user-accounting-connections";

export function getProviderActivities(
  connection: StoredAccountingConnection,
): AnyAccountingProviderActivities {
  return connection.provider === "smartaccounts"
    ? smartAccountsProviderAdapter
    : meritProviderAdapter;
}

export function getProviderCredentials(
  connection: StoredAccountingConnection,
): SmartAccountsCredentials | MeritCredentials {
  return connection.credentials.credentials;
}

export function getTypedProviderActivities<TCredentials>(
  activities: AccountingProviderActivities<TCredentials>,
): AccountingProviderActivities<TCredentials> {
  return activities;
}
