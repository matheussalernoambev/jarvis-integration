import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function AccessDenied() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
      <ShieldX className="h-16 w-16 text-destructive mb-4" />
      <h1 className="text-2xl font-bold mb-2">{t('accessDenied.title')}</h1>
      <p className="text-muted-foreground mb-6 max-w-md">
        {t('accessDenied.message')}
      </p>
      <Button onClick={() => navigate("/")}>
        {t('accessDenied.backToDashboard')}
      </Button>
    </div>
  );
}
