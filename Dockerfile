FROM nginx:stable-alpine

# Copy static files to nginx html directory
COPY index.html /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/

# Expose port (Nginx uses 80 by default)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
