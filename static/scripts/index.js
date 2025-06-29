document.addEventListener('DOMContentLoaded', () => {
    // load dom objects
    const links = document.querySelectorAll('.sidebar-link');
    const sections = document.querySelectorAll('main > div > section');

    // Function to handle showing the correct section
    const showSection = (targetId) => {
        sections.forEach(sec => {
            if (sec.id === targetId) {
                sec.classList.remove('hidden');
            } else {
                sec.classList.add('hidden');
            }
        });
    };

    // Function to handle active link state
    const setActiveLink = (activeLink) => {
        links.forEach(link => {
            if (link === activeLink) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    };

    links.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            // Update the URL hash without jumping
            history.pushState(null, null, `#${targetId}`);
            showSection(targetId);
            setActiveLink(link);
        });
    });

    // Handle initial page load based on URL hash
    const currentHash = window.location.hash.substring(1) || 'sim';
    const initialLink = document.querySelector(`.sidebar-link[href="#${currentHash}"]`) || document.querySelector('.sidebar-link[href="#sim"]');

    showSection(initialLink.getAttribute('href').substring(1));
    setActiveLink(initialLink);
});