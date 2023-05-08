import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import * as fs from 'fs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class CourseChatbotAppCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a new VPC
    const vpc = new ec2.Vpc(this, 'courseChatbotVpc', {
      maxAzs: 2,
      cidr: '10.0.0.0/16',
      subnetConfiguration: [
        {
          name: 'courseChatbotPublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24
        }
      ]
    });

    // Create IAM role for EC2 instance
    const ec2Role = new iam.Role(this, 'courseChatbotRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    // Grant the role permissions to access SSM and CloudWatch Logs
    ec2Role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
    ec2Role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'));

    // Create a security group for the instance
    const sg = new ec2.SecurityGroup(this, "courseChatbotSg", {
      vpc,
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22)); // allow SSH access from anywhere
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80)); // allow HTTP access from anywhere
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443)); // allow HTTPS access from anywhere
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5000)); // allow CUSTOM


    // Create EC2 instance
    const instance = new ec2.Instance(this, 'courseChatbotInstance', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      vpc,
      role: ec2Role,
      securityGroup: sg,
      keyName: 'course-chatbot-key-pair',
    })
    
    const nginxConfigFile = fs.readFileSync('C:\\code\\course_chatbot_app_cdk\\lib\\configurations\\nginx.conf', 'utf8');
    const publicKeyFile = fs.readFileSync('C:\\code\\course_chatbot_app_cdk\\lib\\configurations\\cert.pem', 'utf8');
    const privateKeyFile = fs.readFileSync('C:\\code\\course_chatbot_app_cdk\\lib\\configurations\\key.pem', 'utf8');
    const chatbotServiceFile = fs.readFileSync('C:\\code\\course_chatbot_app_cdk\\lib\\configurations\\chatbot.service', 'utf8');
    
    // config nginx
    instance.addUserData(
      'yum update -y',
      'yum install git -y',
      // 'yum install nginx -y',
      'sudo amazon-linux-extras install nginx1 -y',
      'mkdir /etc/nginx/ssl',
      `echo "${nginxConfigFile}" > /etc/nginx/nginx.conf`,
      `echo "${publicKeyFile}" > /etc/nginx/ssl/cert.pem`,
      `echo "${privateKeyFile}" > /etc/nginx/ssl/key.pem`,
      'systemctl enable nginx',
      'systemctl start nginx',
    );

    // create structure for chatbot app
    instance.addUserData(
      'mkdir /opt/chatbot',
      'chmod 777 /opt/chatbot',
      `echo "${chatbotServiceFile}" > /etc/systemd/system/chatbot.service`,
      'systemctl daemon-reload',
      'systemctl enable chatbot.service',
    )

    // install python3.9, need manually steps
    // ./configure --enable-optimizations --prefix=/usr/local
    // make -j 4
    // sudo make altinstall
    // sudo ln -sf /usr/local/bin/python3.9 /usr/bin/python3

    instance.addUserData(
      'yum update -y',
      'yum install -y gcc openssl-devel bzip2-devel libffi-devel zlib-devel tk-devel readline-devel sqlite-devel',
      'wget https://www.python.org/ftp/python/3.9.0/Python-3.9.0.tgz -O /var/tmp/Python-3.9.0.tgz',
      'tar -xzf /var/tmp/Python-3.9.0.tgz -C /var/tmp'
    )

    // install pip
    instance.addUserData(
      'yum update -y',
      'yum install python3-pip -y',
      'pip3 install virtualenv'
    )

    // install certbot
    instance.addUserData(
      'yum update -y',
      'sudo amazon-linux-extras install epel -y',
      'sudo yum install certbot -y',
      'sudo yum install certbot-nginx -y'
    )

    // need to update openssl to 1.1.1+
    // sudo yum install -y make gcc zlib-devel
    // wget https://www.openssl.org/source/openssl-1.1.1k.tar.gz
    // tar -xzf openssl-1.1.1k.tar.gz
    // cd openssl-1.1.1k
    // ./config --prefix=/usr/local/ssl --openssldir=/usr/local/ssl shared zlib
    // make
    // sudo make install
    // export LD_LIBRARY_PATH=/usr/local/ssl/lib:$LD_LIBRARY_PATH




    // Allow the EC2 instance to access SSM
    instance.role!.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    // Allow the EC2 instance to access SSM
    instance.role!.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    const hostedZoneId = 'Z09029461HKF9DVN00TE2'; // replace with your hosted zone ID
    const domainName = 'profanswers.com'; // replace with your domain name
    const instancePublicIp = instance.instancePublicIp;
    
    new route53.ARecord(this, 'chatbotRecord', {
      zone: route53.HostedZone.fromHostedZoneAttributes(this, 'chatbotZone', {
        hostedZoneId: hostedZoneId,
        zoneName: domainName,
      }),
      recordName: 'www', // replace with your subdomain name, e.g. 'www'
      target: route53.RecordTarget.fromIpAddresses(instancePublicIp),
    });
  }
}
