import { ipcBridge } from '@/common';
import { LoadingTwo } from '@icon-park/react';
import React, { useEffect, useState } from 'react';

const LocalImageView: React.FC<{
  src: string;
  alt: string;
  className?: string;
}> = ({ src, alt, className }) => {
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState(src);
  useEffect(() => {
    ipcBridge.fs.getImageBase64.invoke({ path: src }).then((base64) => {
      setUrl(base64);
      setLoading(false);
    });
  }, [src]);
  if (loading)
    return (
      <div className='flex items-start gap-4px '>
        <LoadingTwo className='loading flex mt-4px' theme='outline' size='14' fill='#333' strokeWidth={2} />
        {alt}
      </div>
    );
  return <img src={url} alt={alt} className={className} />;
};

export default LocalImageView;
