
# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

# Naithorn Bakery Management System

A modern, mobile-first bakery management application built with React, Vite, and Supabase. Track production, delivery, sales, and inventory in real-time.

## Features

- **Role-based Access Control**: Worker, Delivery, Sales, and Admin roles
- **Production Logging**: Track batch production with timestamps
- **Delivery Management**: Start and complete delivery trips with real-time timers
- **Sales Recording**: Customer search, product selection, and M-Pesa balance tracking
- **Admin Dashboard**: Real-time KPIs, revenue charts, inventory tracking, and sales ledger
- **Toast Notifications**: Success/error feedback for all operations
- **Loading States**: Skeleton loaders and spinners for better UX
- **Error Handling**: Graceful error messages for failed operations
- **Mobile Optimized**: 48px tap targets, safe-area padding for notched phones
- **Mock Mode**: Works without Supabase using demo data

## Tech Stack

- **Frontend**: React 18, Vite
- **Routing**: React Router DOM
- **Backend**: Supabase (PostgreSQL, Real-time subscriptions)
- **Charts**: Recharts
- **Date Handling**: date-fns
- **Styling**: CSS with custom variables

## Installation

1. Clone the repository:
```bash
git clone https://github.com/shammahpaluku/shammah.git
cd shammah
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:
```
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

4. Run the development server:
```bash
npm run dev
```

5. Open http://localhost:5173 in your browser

## Demo Mode (Without Supabase)

The app includes a mock Supabase client that allows you to test the UI without configuring a real database. Simply run the app without setting up the `.env` file, and it will use demo data:

- Pre-populated inventory (Cream Roll, Sausage Roll, Jam Doughnut, etc.)
- Sample customers with M-Pesa balances
- All CRUD operations work with in-memory data

The console will show: "Supabase not configured. Using mock data for demo."

## Usage

### Login
1. Select a role (Worker, Delivery, Sales, or Admin)
2. Enter any 4-digit PIN
3. Click "Sign In"

### Worker View
- Log production batches with product type and quantity
- View today's submission history
- Real-time updates via Supabase subscriptions

### Delivery View
- Start new delivery trips with crate count
- Track trip duration with live timer
- Complete trips and update inventory
- View completed trip history

### Sales View
- Search customers by name
- View customer M-Pesa balance
- Select products and record sales
- Real-time inventory updates
- View today's sales log

### Admin Dashboard
- View KPIs: Revenue, cakes sold, crates in store
- Hourly revenue chart
- Inventory location tracking
- Active workers list
- Full sales ledger with search

## Project Structure

```
src/
├── components/
│   └── BottomNav.jsx          # Bottom navigation bar
├── contexts/
│   └── ToastContext.jsx        # Toast notification system
├── lib/
│   └── supabase.js            # Supabase client (with mock mode)
├── pages/
│   ├── AdminDashboard.jsx     # Admin dashboard with KPIs and charts
│   ├── DeliveryView.jsx       # Delivery trip management
│   ├── Login.jsx              # Login page with role selection
│   ├── SalesView.jsx          # Sales recording and inventory
│   └── WorkerView.jsx         # Production batch logging
├── App.jsx                    # Main app with routing
├── index.css                  # Global styles
└── main.jsx                   # Entry point
```

## Database Schema

The app uses the following Supabase tables:

- `production_logs`: Production batch records
- `delivery_trips`: Delivery trip records
- `inventory`: Product inventory
- `customers`: Customer information and M-Pesa balances
- `sales`: Sales transactions

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## License

MIT

