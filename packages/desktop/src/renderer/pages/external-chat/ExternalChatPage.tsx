import React from 'react';
import WebviewHost from '@/renderer/components/media/WebviewHost';

const ExternalChatPage: React.FC = () => {
  return (
    <WebviewHost
      url='http://devops.badousoft.com/aipaas-chat/?pcToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3ODM5Mzg5ODksInVzZXJfbmFtZSI6ImRldm9wc3VzciIsImF1dGhvcml0aWVzIjpbeyJhdXRob3JpdHkiOiJTVVBFUiJ9XSwiY2xpZW50X2lkIjoiaW5pdGlhbC1wcm9qZWN0Iiwic2NvcGUiOiJ3ZWIiLCJMT0dPTl9CRFVTRVIiOnsibG9naW5JZCI6ImRldm9wc3VzciIsInVzZXJJZCI6IlUwMDAwMSIsInVzZXJOYW1lIjoi6LaF57qn566h55CG5ZGYIiwicm9sZUlkIjoiUk9PVCIsInJvbGVOYW1lIjoi5YWr5paX5byA5Y-RIiwicm9sZUNvZGUiOiJTVVBFUiIsIm9yZ0NvZGUiOiJST09UIiwicm9sZUlkcyI6WyJST09UIl0sInJvbGVOYW1lcyI6WyLlhavmlpflvIDlj5EiXSwicm9sZUNvZGVzIjpbIlNVUEVSIl0sIm9yZ0lkIjoiUk9PVCIsIm9yZ05hbWUiOiLlhavmlpflvIDlj5EiLCJvcmdUeXBlIjowLCJhbGxvd0VkaXQiOmZhbHNlLCJiZWxvbmdDb21wYW55SWQiOiIiLCJjZXJ0aWZpY2F0ZU5vIjoiIn19.T40YNnpHlZMeD7bRrNdCLhfeA2V2f5Maks5FOCCOQxA'
      showNavBar
      className='h-full bg-bg-1'
    />
  );
};

export default ExternalChatPage;
