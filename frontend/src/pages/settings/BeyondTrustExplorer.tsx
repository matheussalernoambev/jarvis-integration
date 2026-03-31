import { Shield } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FunctionalAccountsTab } from "@/components/beyondtrust/FunctionalAccountsTab";
import { QuickRulesTab } from "@/components/beyondtrust/QuickRulesTab";
import { WorkgroupsTab } from "@/components/beyondtrust/WorkgroupsTab";
import { PlatformsTab } from "@/components/beyondtrust/PlatformsTab";
import { PasswordPoliciesTab } from "@/components/beyondtrust/PasswordPoliciesTab";
import { BeyondTrustSyncButton } from "@/components/beyondtrust/BeyondTrustSyncButton";
import { useTranslation } from "react-i18next";

const BeyondTrustExplorer = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-8 w-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-4">
          <Shield className="h-8 w-8 text-primary" />
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">{t('beyondTrust.title')}</h2>
            <p className="text-muted-foreground">
              {t('beyondTrust.subtitle')}
            </p>
          </div>
        </div>
        <BeyondTrustSyncButton />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="functional-accounts" className="w-full">
        <TabsList className="mb-6 w-full justify-start">
          <TabsTrigger value="functional-accounts">{t('beyondTrust.tabs.functionalAccounts')}</TabsTrigger>
          <TabsTrigger value="quick-rules">{t('beyondTrust.tabs.quickRules')}</TabsTrigger>
          <TabsTrigger value="workgroups">{t('beyondTrust.tabs.workgroups')}</TabsTrigger>
          <TabsTrigger value="platforms">{t('beyondTrust.tabs.platforms')}</TabsTrigger>
          <TabsTrigger value="password-policies">{t('beyondTrust.tabs.passwordPolicies')}</TabsTrigger>
        </TabsList>

        <TabsContent value="functional-accounts" className="mt-0">
          <FunctionalAccountsTab />
        </TabsContent>

        <TabsContent value="quick-rules" className="mt-0">
          <QuickRulesTab />
        </TabsContent>

        <TabsContent value="workgroups" className="mt-0">
          <WorkgroupsTab />
        </TabsContent>

        <TabsContent value="platforms" className="mt-0">
          <PlatformsTab />
        </TabsContent>

        <TabsContent value="password-policies" className="mt-0">
          <PasswordPoliciesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BeyondTrustExplorer;
