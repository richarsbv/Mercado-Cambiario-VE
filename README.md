# Mercado Cambiario 🇻🇪

![Dólar VE](icons/icon-192x192.png)

**Mercado Cambiario VE** es una Progressive Web App (PWA) moderna, rápida y elegante diseñada para consultar las tasas de cambio de divisas (Dólar, Euro) en Venezuela en tiempo real. 

La aplicación permite calcular conversiones al instante y funciona sin conexión a internet una vez instalada en tu dispositivo.

## ✨ Características Principales

- 📱 **PWA Instalable:** Accede como una aplicación nativa desde tu móvil o escritorio.
- ⚡ **Calculadora Inteligente:** Conversión bidireccional inmediata de Bs. a Divisas y viceversa.
- 🌙 **Modo Oscuro/Claro:** Interfaz que se adapta automáticamente a tus preferencias.
- 📋 **Copiado Rápido:** Iconos integrados para copiar valores al portapapeles con un toque.
- 🔄 **Funciona Offline:** Gracias al uso de Service Workers e IndexedDB, puedes ver los últimos precios guardados sin conexión.
- 🧹 **Limpieza Profunda:** Botón integrado en ajustes para purgar caché y datos antiguos en caso de errores de sincronización.

## 🛠️ Tecnologías Utilizadas

- **HTML5 & CSS3:** Estructura y diseño responsivo.
- **Tailwind CSS:** Framework de estilos para una interfaz moderna y premium.
- **JavaScript (Vanilla):** Lógica de negocio sin dependencias externas pesadas.
- **Service Workers:** Estrategia *Stale-while-revalidate* para soporte offline.
- **IndexedDB:** Persistencia de datos local para máxima velocidad.
- **DolarAPI:** Fuente de datos confiable para las tasas oficiales y paralelas.

## 🚀 Cómo Empezar

1. Clona este repositorio:
   ```bash
   git clone https://github.com/richarsbv/Mercado-Cambiario-VE.git
   ```
2. Abre `index.html` en tu navegador.
3. *Opcional:* Para aprovechar todas las funciones de PWA, carga el proyecto usando un servidor local (como Live Server en VS Code).

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - mira el archivo [LICENSE](LICENSE) para más detalles.

## 🙏 Créditos

- Datos proporcionados por [DolarAPI.com](https://dolarapi.com/).
- Diseñado con ❤️ para la comunidad venezolana.
