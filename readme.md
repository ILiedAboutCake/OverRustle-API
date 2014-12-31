OverRustle-API
==========
Track viewer counts with socket.io

Main website: https://github.com/ILiedAboutCake/OverRustle

#Installing

## Server Dependencies
* NPM >= 1.4.28
* Node >= 0.10.35
* Nginx >= 1.6.2
* Redis >= 2.8.17

## Node Dependencies
* express >= 4.10.2
* jsonfile >= 2.0.0
* redis >= 0.12.1
* request >= 2.49.0
* socket.io >= 1.2.0

##Nginx reverse-proxy
```
server {
    listen 80;

    location / {
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $http_host;
        proxy_set_header X-NginX-Proxy true;

        proxy_pass http://127.0.0.1:9998/;
        proxy_redirect off;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        add_header X-XSS-Protection "1; mode=block";
    }
}
```
