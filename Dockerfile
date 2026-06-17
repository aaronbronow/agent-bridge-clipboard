FROM node:20-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy compiled JS files
COPY dist/scripts/ ./dist/scripts/

# Expose the broker port
EXPOSE 4224

# Set default env variables
ENV ABC_PORT=4224
ENV NODE_ENV=production

# Run the compiled broker
CMD ["node", "dist/scripts/broker.js"]
