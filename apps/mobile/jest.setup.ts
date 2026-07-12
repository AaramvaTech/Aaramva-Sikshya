// I18N-1: initialize i18next (English) before any test renders a component that
// calls t(). Without this, react-i18next has no instance and t() returns the
// raw key, breaking render assertions.
import { initI18n } from './lib/i18n';

initI18n('en');
