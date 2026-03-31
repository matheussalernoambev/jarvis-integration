import { Outlet, useLocation, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SettingsBreadcrumb from "@/components/settings/SettingsBreadcrumb";

const Settings = () => {
  const { t } = useTranslation();
  const location = useLocation();

  // Redirect to default page if on /settings root
  if (location.pathname === "/settings") {
    return <Navigate to="/settings/integrations/beyondtrust" replace />;
  }

  return (
    <div className="p-6 lg:p-8 h-full">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('settings.title')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('settings.subtitle')}
        </p>
      </div>

      <SettingsBreadcrumb />

      <div className="w-full">
        <Outlet />
      </div>
    </div>
  );
};

export default Settings;
