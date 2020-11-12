cd /home/ubuntu/webapp/src
pwd
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/home/ubuntu/webapp/src/amazon-cloudwatch-agent.json -s
pm2 start server.js