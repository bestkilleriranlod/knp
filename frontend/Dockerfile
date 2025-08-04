FROM node:18

WORKDIR /knp_frontend

COPY package*.json ./

RUN npm install

COPY . .

# Disable ESLint
ENV CI=false
ENV DISABLE_ESLINT_PLUGIN=true

# Start the development server instead of building
# This allows for better error reporting and debugging
CMD ["npm", "start"]