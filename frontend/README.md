# Business Connect Client

A modern React-based client application for Business Connect inventory management system. This client connects to the Business Connect NestJS backend for API operations.

## 🚀 Features

- **Modern UI**: Built with React 18, TypeScript, and Tailwind CSS
- **Offline Support**: PouchDB integration for offline-first functionality
- **Real-time Sync**: WebSocket support for real-time updates
- **Responsive Design**: Mobile-friendly interface with dark mode support
- **Component Library**: Radix UI components with custom styling
- **Form Validation**: React Hook Form with Zod validation
- **State Management**: TanStack Query for server state
- **Barcode Scanning**: Built-in barcode scanner support

## 📋 Prerequisites

- Node.js 18+ and npm
- Business Connect Backend running on `http://localhost:5000`

## 🛠️ Installation

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment (optional):**

   ```bash
   cp env.example .env
   ```

   Edit `.env` if you need to change the backend URL for production builds.

## 🏃 Running the Application

### Development Mode

Start the development server with hot reload:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

**Note**: The Vite dev server is configured to proxy `/api` requests to `http://localhost:5000`, so make sure the backend is running.

### Production Build

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## 🔧 Configuration

### Vite Proxy Configuration

The development server proxies API requests to the backend. This is configured in `vite.config.ts`:

```typescript
server: {
  port: 3000,
  proxy: {
    "/api": {
      target: "http://localhost:5000",
      changeOrigin: true,
      secure: false,
    },
  },
}
```

### Backend Connection

Ensure the Business Connect backend is running before starting the client:

```bash
cd ../Business Connect/backend
npm run dev
```

The backend should be accessible at `http://localhost:5000`.

## 📁 Project Structure

```
Business-Connect-Client/
├── src/
│   ├── components/       # Reusable UI components
│   │   ├── ui/          # Base UI components (Radix)
│   │   └── ...          # Feature-specific components
│   ├── contexts/        # React contexts (Theme, Tenant)
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Utility libraries
│   │   ├── pouchdb.ts   # PouchDB configuration
│   │   ├── queryClient.ts # TanStack Query setup
│   │   └── utils.ts     # Utility functions
│   ├── pages/           # Page components
│   ├── utils/           # Helper utilities
│   ├── App.tsx          # Main app component
│   ├── main.tsx         # Entry point
│   └── index.css        # Global styles
├── shared/              # Shared types and schemas
├── index.html           # HTML template
├── vite.config.ts       # Vite configuration
├── tailwind.config.ts   # Tailwind configuration
├── tsconfig.json        # TypeScript configuration
└── package.json         # Dependencies
```

## 🔌 API Endpoints

The client connects to these backend endpoints:

- `/api/auth` - Authentication
- `/api/tenants` - Tenant management
- `/api/products` - Product management
- `/api/categories` - Category management
- `/api/customers` - Customer management
- `/api/sales` - Sales management
- `/api/staff` - Staff management
- `/api/stock` - Stock management
- `/api/dashboard` - Dashboard data
- `/api/pouchdb` - PouchDB replication
- `/api/ws/signaling` - WebSocket signaling

## 🎨 Customization

### Theme

The application supports dark mode by default. Theme configuration is in `tailwind.config.ts`.

### Components

UI components are based on Radix UI and customized with Tailwind CSS. Component definitions are in `src/components/ui/`.

### Styling

Global styles are in `src/index.css`. The design system uses CSS variables for theming.

## 🧪 Type Checking

Run TypeScript type checking:

```bash
npm run check
```

## 📦 Key Dependencies

### Core

- **React** 18.3+ - UI library
- **TypeScript** 5.6+ - Type safety
- **Vite** 5.4+ - Build tool

### UI & Styling

- **Tailwind CSS** 3.4+ - Utility-first CSS
- **Radix UI** - Accessible components
- **Lucide React** - Icons
- **Framer Motion** - Animations

### State & Data

- **TanStack Query** 5.60+ - Server state
- **React Hook Form** 7.55+ - Form handling
- **Zod** 3.24+ - Schema validation
- **PouchDB** 9.0+ - Offline database

### Other

- **Wouter** 3.3+ - Lightweight routing
- **jsPDF** 3.0+ - PDF generation
- **Recharts** 2.15+ - Charts

## 🔐 Authentication

The application uses session-based authentication. Users must log in through the `/api/auth/login` endpoint. Sessions are maintained via cookies.

## 💾 Offline Functionality

The application uses PouchDB for offline data storage and synchronization:

- **Local Storage**: Data is stored in IndexedDB via PouchDB
- **Sync**: Automatic synchronization when online
- **Conflict Resolution**: Built-in conflict handling

## 🚨 Troubleshooting

### Backend Connection Issues

If you see connection errors:

1. Verify the backend is running on port 5000
2. Check CORS configuration in the backend
3. Ensure the proxy configuration in `vite.config.ts` is correct

### Build Issues

If the build fails:

1. Clear node_modules and reinstall: `rm -rf node_modules && npm install`
2. Clear Vite cache: `rm -rf node_modules/.vite`
3. Check TypeScript errors: `npm run check`

### Port Already in Use

If port 3000 is in use, you can change it in `vite.config.ts`:

```typescript
server: {
  port: 3001, // Change to any available port
  // ...
}
```

## 📝 Development Guidelines

### Code Style

- Use TypeScript for all new files
- Follow the existing component structure
- Use functional components with hooks
- Keep components focused and reusable

### Component Creation

- Place reusable components in `src/components/`
- Place page components in `src/pages/`
- Use Radix UI primitives when possible
- Follow the existing naming conventions

### State Management

- Use TanStack Query for server state
- Use React Context for global UI state (theme, tenant)
- Use local state for component-specific state

## 🤝 Contributing

When contributing:

1. Follow the existing code style
2. Add TypeScript types for all new code
3. Test offline functionality if applicable
4. Ensure responsive design works on mobile

## 📄 License

MIT

## 🔗 Related Projects

- [Business Connect Backend](../Business Connect/backend) - NestJS backend API
- [Business Connect 2](../Business%20Connect%202) - Original full-stack application

## 📞 Support

For issues or questions:

1. Check the backend is running and accessible
2. Review the browser console for errors
3. Check the network tab for failed API requests
4. Verify PouchDB is working in offline mode

---

**Note**: This client requires the Business Connect NestJS backend to be running. Make sure to start the backend before launching the client application.
