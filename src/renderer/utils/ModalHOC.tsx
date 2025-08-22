import type { ModalProps } from '@arco-design/web-react';
import React, { useMemo, useState } from 'react';

type TUseModalReturn<Props extends Record<string, any> = {}> = [
  {
    open(params?: Partial<Props>): void;
    close(): void;
  },
  React.ReactNode,
];
const ModalHOC = <Props extends Record<string, any> = {}>(
  ModalBodyComponent: React.FC<
    Props & {
      modalCtrl: {
        close(): void;
      };
      modalProps: ModalProps;
    }
  >,
  defaultModalProps?: ModalProps
) => {
  const ModalComponent: React.FC<
    Props & {
      modalProps: ModalProps;
      modalCtrl: {
        close(): void;
      };
    }
  > & {
    useModal: (props: Props) => TUseModalReturn<Props>;
  } = ({ modalProps, modalCtrl, ...props }) => {
    const mergeModalProps = useMemo(() => {
      return {
        onCancel() {
          modalCtrl.close();
        },
        ...(defaultModalProps || {}),
        ...modalProps,
      };
    }, [defaultModalProps, modalProps]);
    return <ModalBodyComponent {...(props as unknown as Props)} modalCtrl={modalCtrl} modalProps={mergeModalProps}></ModalBodyComponent>;
  };

  const useModal = (props: Props): TUseModalReturn<Props> => {
    const [visible, setVisible] = useState(false);
    const [modalProps, setModalProps] = useState<Partial<Props>>({});

    const ctrl = useMemo(() => {
      return {
        open(params?: Partial<Props>) {
          setVisible(true);
          if (params) setModalProps(params);
        },
        close() {
          setVisible(false);
        },
      };
    }, [visible, setVisible, setModalProps]);

    const modalCtrl = useMemo(() => {
      return {
        close() {
          setVisible(false);
        },
      };
    }, []);

    return [ctrl, <ModalComponent {...props} {...modalProps} modalProps={{ visible }} modalCtrl={modalCtrl}></ModalComponent>];
  };
  ModalComponent.useModal = useModal;
  return ModalComponent;
};

ModalHOC.Extra = <Props extends Record<string, any> = {}>(defaultModalProps?: ModalProps) => {
  return (
    ModalBodyComponent: React.FC<
      Props & {
        modalProps: ModalProps;
        modalCtrl: {
          close(): void;
        };
      }
    >
  ) => {
    return ModalHOC<Props>(ModalBodyComponent, defaultModalProps);
  };
};

export default ModalHOC;
