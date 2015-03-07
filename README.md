app to shoot pictures with a Canon EOS

# Install

```
$ sudo apt-get install avahi-daemon libnss-mdns libavahi-compat-libdnssd-dev curl
npm i
npm start
```

If you have no camera you can just run it using :

```
node app.js -f
```

open http://localhost:1337

# Stream

To see a preview stream, run mjpg_streamer, as mentioned [here](https://github.com/soixantecircuits/pyying)

# Debug

If something wrong with your camera, try some basic commands with the gphoto2 utility:

`gphoto2 --auto-detect --list-config`
`gphoto2 --auto-detect --capture-image-and-download`


