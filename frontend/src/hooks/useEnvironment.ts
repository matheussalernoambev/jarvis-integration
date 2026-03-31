/**
 * Hook to detect execution environment.
 * After migration from Supabase, this always returns on-premises.
 */
export function useEnvironment() {
  return {
    isOnPremises: true,
    isCloud: false,
    apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  };
}
