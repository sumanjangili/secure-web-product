import React from 'react';
import ConsentBanner from './components/ConsentBanner';
import SecureForm from './components/SecureForm';

const App: React.FC = () => {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Secure Web Product Demo</h1>
      <ConsentBanner />
      <hr />
      <SecureForm />
    </div>
  );
};

export default App;
