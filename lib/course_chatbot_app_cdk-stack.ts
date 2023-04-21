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
      'yum install nginx -y',
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

    // install pip
    instance.addUserData(
      'yum update -y',
      'yum install python3-pip -y',
      'pip3 install virtualenv'
    )

    // Allow the EC2 instance to access SSM
    instance.role!.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    // Allow the EC2 instance to access SSM
    instance.role!.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    // Allow an Elastic IP address for this instance
    const eip = new ec2.CfnEIP(this, 'courseChatbotEip', {
      domain: 'vpc',
    });

    const eipAssoc = new ec2.CfnEIPAssociation(this, 'courseChatbotEipAssoc', {
      eip: eip.ref,
      instanceId: instance.instanceId,
    });

     // Create a Route 53 hosted zone
     const zone = new route53.PublicHostedZone(this, 'courseChatbotZone', {
      zoneName: 'course.chatbot.com',
    });

    const aRecord = new route53.ARecord(this, 'courseChatbotARecord', {
      recordName: 'course.chatbot.com',
      zone: zone,
      target: route53.RecordTarget.fromIpAddresses(eip.ref),
    });

    // Output the instance public IP address
    new cdk.CfnOutput(this, 'courseChatbotPublicIp', {
      value: instance.instancePublicIp!,
    });
  }
}
