app to shoot pictures with a Canon EOS

# Install

Before start, make sure you have installed [zeromq](http://zeromq.org/intro:get-the-software) and [gphoto](http://www.gphoto.org/).


```
$ sudo apt-get install avahi-daemon libnss-mdns libavahi-compat-libdnssd-dev libgphoto2-2-dev curl
npm i
cp config/config.example.json config/config.json
```
Then fill it with your informations, and when it's done:
```
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

# PM2

If you're using Zhaoxiang with PM2, be sure to power on the camera before power on the computer to prevent errors. If camera isn't detected, power off/on the camera, and then restart the mp2 app. 

#Crop

There is a crop, please fill your dimension in the config.json file, the crop begin in the top left corner of image, as displayed in front view.