# Running the Backend

Follow these steps to run the backend:

## Prerequisites

- Ensure you have Node.js version `>=20.15.0` installed.
- Rename the `.env.local` file to `.env` in the root directory.
- Update the `.env` file with the required environment variables:

- Install dependencies by running:
  ```bash
  npm install
  ```

## Commands

### Build the Project

Compile TypeScript files to JavaScript:

```bash
npm run build
```

### Start the Server

Run the compiled server:

```bash
npm start
```

### Development Mode

Run the server with live reload:

```bash
npm run dev
```

### Database Operations

- Generate database migrations:
  ```bash
  npm run generate
  ```
- Apply database migrations:
  ```bash
  npm run migrate
  ```
