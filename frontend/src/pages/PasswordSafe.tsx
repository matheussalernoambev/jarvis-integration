import { useTranslation } from "react-i18next";
import { Shield } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PasswordFailuresContent from "@/components/password-safe/PasswordFailuresContent";
import AutomanageDisabledContent from "@/components/password-safe/AutomanageDisabledContent";

export default function PasswordSafe() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          {t("passwordSafe.title")}
        </h1>
        <p className="text-muted-foreground">
          {t("passwordSafe.subtitle")}
        </p>
      </div>

      <Tabs defaultValue="failures" className="w-full">
        <TabsList>
          <TabsTrigger value="failures">
            {t("passwordSafe.tabFailures")}
          </TabsTrigger>
          <TabsTrigger value="automanage-disabled">
            {t("passwordSafe.tabAutomanageDisabled")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="failures">
          <PasswordFailuresContent />
        </TabsContent>

        <TabsContent value="automanage-disabled">
          <AutomanageDisabledContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}
