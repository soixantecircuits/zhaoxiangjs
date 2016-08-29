app to shoot pictures with a Canon EOS

# Install

Before start, make sure you have installed [zeromq](http://zeromq.org/intro:get-the-software) and [gphoto](http://www.gphoto.org/).

You'll need `node v0.10.46`. To make sure you have the correct version, use `nvm` ([installation instructions here](https://github.com/creationix/nvm)). Once you have it installed, type `nvm install 0.10.37`, then `nvm use 0.10.37` and finally `nvm use alias default` to make this version the default one.

!Warning!
Running on Mac OS 10.9+ you might need to link to your local folder. This is related to the related issue https://github.com/lwille/node-gphoto2/issues/57 

```
sudo ln -s /usr/local /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX10.11.sdk/usr/local
```

```
$ sudo apt-get install avahi-daemon libnss-mdns libavahi-compat-libdnssd-dev libgphoto2-2-dev curl
npm i
cp -n config/config.example.json config/config.json
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

You can also run a magic commandline to see the stream as a webcam in your browser.
If you use chrome or electron, please follow the instructions in next section.

Install v4l2loopback

```
git clone https://github.com/umlaeute/v4l2loopback.git
cd v4l2loopback
sudo make
sudo make install
```

And run

```
sudo modprobe v4l2loopback
mjpg_streamer -i "/usr/local/lib/input_file.so -r -f /tmp/stream" -o     "/usr/local/lib/output_http.so -w /usr/local/www -p 8080"
gst-launch-0.10 -v souphttpsrc location='http://localhost:8080/?action=stream' is-live=true ! multipartdemux ! decodebin2 ! v4l2sink device=/dev/video1
```

## chrome or electron

There is an isssue in chrome that filters video incorrectly, which makes our dummy video not seen.
To fix this, here is an hack in v4l2loopback:

```
git clone https://github.com/bluetiger9/v4l2loopback
cd v4l2loopback
sudo make
sudo make install
```

And run

```
sudo modprobe v4l2loopback exclusive_caps=1
mjpg_streamer -i "/usr/local/lib/input_file.so -r -f /tmp/stream" -o     "/usr/local/lib/output_http.so -w /usr/local/www -p 8080"
gst-launch-0.10 -v souphttpsrc location='http://localhost:8080/?action=stream' is-live=true ! multipartdemux ! decodebin2 ! v4l2sink device=/dev/video1
```

# Debug

If something wrong with your camera, try some basic commands with the gphoto2 utility:

`gphoto2 --auto-detect --list-config`
`gphoto2 --auto-detect --capture-image-and-download`
