import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

const languages = [
  { code: 'pt-BR', name: 'Português', flag: '🇧🇷' },
  { code: 'en-US', name: 'English', flag: '🇺🇸' },
];

export function LanguageSelector() {
  const { i18n } = useTranslation();
  
  const currentLang = languages.find(l => l.code === i18n.language) || languages[0];
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="gap-1.5 px-2 hover:bg-sidebar-accent text-sidebar-foreground"
        >
          <span className="text-base">{currentLang.flag}</span>
          <span className="text-xs hidden sm:inline">{currentLang.name}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            className="gap-2 cursor-pointer"
          >
            <span className="text-base">{lang.flag}</span>
            <span>{lang.name}</span>
            {lang.code === i18n.language && (
              <span className="ml-auto text-primary">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
