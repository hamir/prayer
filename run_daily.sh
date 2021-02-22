echo "[`date`] ./run_daily $@" >> ~/projects/prayer/run_history.log
echo "[`date`] ./run_daily $@" >> /tmp/debug.txt
/usr/local/bin/node ~/projects/prayer/app.js $@ | tee /tmp/debug.txt