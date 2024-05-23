# Use the official Node.js image.
FROM node:16-alpine as base

# Set the working directory
WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Expose the port
EXPOSE 5500

# Install dependencies based on the NODE_ENV value
FROM base as production
ENV NODE_ENV=production
RUN npm ci
COPY . .
CMD ["node", "index.js"]

FROM base as dev
ENV NODE_ENV=development
RUN npm install -g nodemon && npm install
COPY . .
CMD ["nodemon", "index.js"]

