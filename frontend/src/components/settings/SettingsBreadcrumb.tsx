import { useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface BreadcrumbConfig {
  label: string;
  path?: string;
}

const SettingsBreadcrumb = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const pathname = location.pathname;

  const getBreadcrumbItems = (): BreadcrumbConfig[] => {
    const items: BreadcrumbConfig[] = [
      { label: t('breadcrumb.settings'), path: '/settings' }
    ];

    if (pathname.includes('/settings/integrations')) {
      items.push({ label: t('breadcrumb.integrations') });
      
      if (pathname.includes('/beyondtrust')) {
        items.push({ label: t('breadcrumb.beyondtrust') });
      } else if (pathname.includes('/microsoft')) {
        items.push({ label: t('breadcrumb.microsoft') });
      }
    } else if (pathname === '/settings/beyondtrust') {
      items.push({ label: t('breadcrumb.beyondtrustExplorer') });
  } else if (pathname === '/settings/schedules') {
    items.push({ label: t('breadcrumb.schedules') });
  }

  return items;
  };

  const breadcrumbItems = getBreadcrumbItems();

  return (
    <Breadcrumb className="mb-6">
      <BreadcrumbList>
        {breadcrumbItems.map((item, index) => {
          const isLast = index === breadcrumbItems.length - 1;
          
          return (
            <BreadcrumbItem key={index}>
              {index > 0 && <BreadcrumbSeparator />}
              {isLast ? (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={item.path || '#'}>{item.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export default SettingsBreadcrumb;
