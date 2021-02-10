FROM node:12.18.0-alpine3.9

WORKDIR /usr/src/app

ADD yarn.lock /usr/src/app/yarn.lock
ADD package.json /usr/src/app/package.json
ADD start.sh /usr/src/app/start.sh
RUN chmod +x /usr/src/app/start.sh
RUN apk update && apk upgrade && \
    apk add --no-cache bash git openssh
RUN cd /usr/src/app && yarn

ADD basic /usr/src/app/basic
ADD tip /usr/src/app/tip
ADD invoice /usr/src/app/invoice

ENTRYPOINT ["/usr/src/app/start.sh"]