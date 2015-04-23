#to run a mjpeg server (like IP camera)
# run $ mjpg_streamer -i "/usr/local/lib/input_file.so -r -f /tmp/stream" -o "/usr/local/lib/output_http.so -w /usr/local/www -p 8080"


import threading
import os
import sys
import time
import glob
import getopt
import re
import signal
from OSC import * #required, to install : sudo pip install pyOSC
import picamera
import json
import zerorpc

class Pyying():

    isShooting = False
    isClosing = False


    def __init__(self):



        # TERM
        signal.signal(signal.SIGTERM, self.sigclose)

        try:

          self.camera =  picamera.PiCamera()
          # camera settings
          # http://picamera.readthedocs.org/en/release-1.8/api.html?highlight=shutter#picamera.PiCamera.awb_gains
          self.camera.awb_gains = (365/256., 75/64.)
          self.camera.awb_mode = 'off'
          #self.camera.awb_mode = 'fluorescent'
          self.camera.brightness = 50
          self.camera.color_effects = None
          self.camera.contrast = 0
          self.camera.drc_strength = 'off'
          self.camera.exposure_compensation = 0
          self.camera.exposure_mode = 'off'
          self.camera.image_denoise = False
          self.camera.image_effect = 'none'
          self.camera.iso = 800
          self.camera.meter_mode = 'spot'
          self.camera.resolution = (1024, 768)
          self.camera.saturation = 0
          self.camera.sharpness = 0
          self.camera.shutter_speed = 10000
          # Camera warm-up time
          #self.camera.start_preview()
          time.sleep(2)
          #g = self.camera.awb_gains
          #print 'gain: ' + str(g[0]) + ', ' + str(g[1])

        except KeyboardInterrupt:
          self.close()
        except Exception as e:
          print str(e)
          self.close()



    def sigclose(self, signum, frame):
      self.isClosing = True

    def close(self):
        self.isClosing = True
        self.camera.close()
        print "Have a good day!"

    def quit_pressed(self):
      return self.isClosing


    def shoot(self, path):
        try:
          print "shoot"
          print path
          self.camera.capture(path)
          self.isShooting = True
        except KeyboardInterrupt:
          self.close()
        except Exception as e:
          print str(e)
          self.close()
        return path

    def set_setting(self, setting, data):
        try:
          print "change settings"
          #print "key: " + data[0]
          #print "value: " + str(data[1])
          print "key: " + setting
          print "value: " + str(data)
          if type(data) != type('') or setting == 'iso' or setting == 'rotation':
            data = int(data) 
          if setting == 'resolution':
            data = eval(data)
          if setting == "awb_gain_red":
            g = self.camera.awb_gains
            g = (data, g[1])
            self.camera.awb_gains = g
          if setting == "awb_gain_blue":
            g = self.camera.awb_gains
            g = (g[0], data)
            self.camera.awb_gains = g
          else:
            setattr(self.camera, setting, data)
        except picamera.PiCameraValueError as e:
          print str(e)

        except KeyboardInterrupt:
          self.close()
        except Exception as e:
          print str(e)
          self.close()
        return "setting is set"
    def start(self):
      while True:
        try:
          pass
           


        except KeyboardInterrupt:
          self.close()
        except Exception as e:
          print str(e)
          self.close()



def main(argv):
  nowindow = False
  host = "localhost"
  port = 4242
  try:
    opts, args = getopt.getopt(argv,"hni:p:",["nowindow", "ip=", "port="])
  except getopt.GetoptError:
    print 'pyying.py -h to get help'
    sys.exit(2)
  for opt, arg in opts:
    if opt == '-h':
      print 'press spacebar to take a snapshot'
      print 'run "pyying.py --nowindow" for a x-less run'
      sys.exit()
    elif opt in ("-n", "--nowindow"):
        nowindow = True
    elif opt in ("-i", "--ip"):
        host = arg
    elif opt in ("-p", "--port"):
        port = arg

  #ying = Pyying()
  #ying.start()
  s = zerorpc.Server(Pyying())
  s.bind("tcp://0.0.0.0:4242")
  s.run()

if __name__ == '__main__':
	main(sys.argv[1:])
