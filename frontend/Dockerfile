FROM node:18 as build

WORKDIR /knp_frontend

COPY package*.json ./

RUN npm install

COPY . .

# Build the app
RUN npm run build

# Serve using a lightweight server
FROM node:18-alpine

WORKDIR /knp_frontend

# Install serve to run the application
RUN npm install -g serve

# Copy the build folder from the build stage
COPY --from=build /knp_frontend/build /knp_frontend/build

# Serve the static files
CMD ["serve", "-s", "build", "-l", "3000"]